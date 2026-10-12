import {
  BaseError,
  ContractFunctionRevertedError,
  decodeFunctionResult,
  encodeFunctionData,
  getAddress,
  parseAbi,
  type Abi,
  type Address,
  type PublicClient,
} from "viem";
import { z } from "zod";
import { getDb, num, q } from "../db/client";
import {
  aggregateSpot,
  alertThresholdPct,
  classifyTier,
  decodeOraclePrice,
  executableSpreadPct,
  inRangeDepthUsd,
  liquidityConfidence,
  nearlyEqual,
  oracleState,
  persistSpreadAlert,
  priceOfToken0InToken1,
  spreadPct,
  tokenEquivalent,
  type OracleState,
  type SessionName,
} from "../xplot/engines";
import { isEtfName, tickerFromEquityFeed } from "../xplot/feeds";
import { resolveSession } from "../xplot/session";

const ASSETS_URL = "https://api.robinhood.com/rhj/assets";
const PRICES_URL = "https://api.robinhood.com/rhj/prices";
const ACTIONS_URL = "https://api.robinhood.com/rhj/corporate-actions";
const FEEDS_URL = "https://reference-data-directory.vercel.app/feeds-robinhood-mainnet.json";
const UNISWAP_DEPLOYMENTS_URL = "https://raw.githubusercontent.com/Uniswap/contracts/main/deployments/json/4663.json";
const CHAIN_ID = 4663;
const RPC = process.env.ROBINHOOD_RPC_URL || "https://rpc.mainnet.chain.robinhood.com";

/**
 * Quote tokens listed on the official Token Contracts page.
 * Source: https://docs.robinhood.com/chain/contracts
 * The collector still checks symbol() before using either address.
 */
const QUOTE_CANDIDATES = [
  { symbol: "USDG", address: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168" },
  { symbol: "WETH", address: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73" },
] as const;

/**
 * Canonical Multicall3 CREATE2 address. Used only when eth_getCode returns bytecode.
 * It is not a token, feed, or pool address.
 */
const MULTICALL3: Address = "0xcA11bde05977b3631167028862bE2a173976CA11";

const erc20Abi = parseAbi([
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
]);

const multiplierAbi = parseAbi([
  "function uiMultiplier() view returns (uint256)",
  "function newUIMultiplier() view returns (uint256)",
  "function effectiveAt() view returns (uint256)",
  "function oraclePaused() view returns (bool)",
]);

const feedAbi = parseAbi([
  "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
  "function decimals() view returns (uint8)",
]);

const multicallAbi = parseAbi([
  "function aggregate3((address target, bool allowFailure, bytes callData)[] calls) payable returns ((bool success, bytes returnData)[] returnData)",
]);

const poolAbi = parseAbi([
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
  "function liquidity() view returns (uint128)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
]);

const quoterAbi = parseAbi([
  "function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96) params) returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
]);

const AssetSchema = z.object({
  id: z.string(),
  tokenSymbol: z.string(),
  tokenName: z.string(),
  deployments: z.array(z.object({ contractAddress: z.string(), chainId: z.number() })).default([]),
  currentMultiplier: z.string().optional().default(""),
  pendingMultiplier: z.string().optional().default(""),
  pendingMultiplierEffectiveTime: z.string().optional().nullable(),
  status: z.string(),
  logoUrl: z.string().optional().nullable(),
  tradingCapabilities: z
    .object({
      market: z.object({ whole: z.string().nullable().optional(), fractional: z.string().nullable().optional() }).optional(),
      extended: z.object({ whole: z.string().nullable().optional(), fractional: z.string().nullable().optional() }).optional(),
      overnight: z.object({ whole: z.string().nullable().optional(), fractional: z.string().nullable().optional() }).optional(),
    })
    .nullable()
    .optional(),
  tokenDecimals: z.number().optional(),
  isin: z.string().optional().nullable(),
});

const AssetsSchema = z.object({ assets: z.array(AssetSchema) });

const QuoteSchema = z.object({
  bid: z.string(),
  ask: z.string(),
  currency: z.string(),
  dailyTradingVolume: z.string().optional(),
  isTradingHalt: z.boolean(),
  generatedAt: z.string(),
});

const PriceSchema = z.union([
  z.object({ quotes: z.array(QuoteSchema) }),
  QuoteSchema,
]);

const FeedSchema = z.object({
  name: z.string(),
  proxyAddress: z.string(),
  heartbeat: z.number(),
  decimals: z.number(),
  docs: z.object({ marketHours: z.string().optional() }).partial().optional(),
});

type Asset = z.infer<typeof AssetSchema>;
type Feed = z.infer<typeof FeedSchema>;

type InstrumentRow = {
  id: number;
  asset_id: string;
  equity_id: string;
  address: string;
  symbol: string;
  current_multiplier: string | null;
  chainlink_feed: string | null;
  feed_decimals: number | null;
  feed_heartbeat_s: number | null;
  all_day_tradability: string | null;
  status: string | null;
  onchain_symbol: string | null;
  onchain_decimals: number | null;
  ui_multiplier: string | null;
  oracle_paused: boolean | null;
};

export type TickResult = {
  ok: boolean;
  tickMs: number;
  counts: Record<string, number>;
  errors: string[];
  log: string;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchBounded(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12_000);
  const signal = init?.signal ? AbortSignal.any([init.signal, ctrl.signal]) : ctrl.signal;
  const headers = new Headers(init?.headers);
  if (!headers.has("user-agent")) headers.set("user-agent", "xplot/0.1 (read-only)");
  try {
    const response = await fetch(input, { ...init, headers, signal });
    const body = await response.arrayBuffer();
    return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetchBounded(url, { headers: { accept: "application/json" } });
  if (res.status === 429) {
    const err = new Error(`429 ${url}`);
    (err as Error & { status?: number }).status = 429;
    throw err;
  }
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return await res.json();
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      last = error;
      if (i === attempts - 1) break;
      const wait = isRateLimit(error) ? 1_500 * 2 ** i : 400 * 2 ** i;
      if (isRateLimit(error)) console.error(`rpc 429, backing off ${wait}ms: ${describeError(error)}`);
      await sleep(wait);
    }
  }
  throw last;
}

async function mapPool<T, R>(items: T[], size: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  for (let i = 0; i < items.length; i += size) {
    const slice = items.slice(i, i + size);
    const part = await Promise.all(slice.map((item, j) => fn(item, i + j)));
    for (let j = 0; j < part.length; j++) out[i + j] = part[j];
    if (i + size < items.length) await sleep(50);
  }
  return out;
}

function numOrNull(value: string | undefined | null): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function overnightTradable(asset: Asset): boolean {
  const overnight = asset.tradingCapabilities?.overnight;
  return overnight?.whole === "TRADING_STATUS_TRADABLE" || overnight?.fractional === "TRADING_STATUS_TRADABLE";
}

let clientPromise: Promise<PublicClient> | null = null;

async function client(): Promise<PublicClient> {
  if (!clientPromise) {
    clientPromise = (async () => {
      const { createPublicClient, http } = await import("viem");
      const { defineChain } = await import("viem");
      const chain = defineChain({
        id: CHAIN_ID,
        name: "Robinhood Chain",
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        rpcUrls: { default: { http: [RPC] } },
        blockExplorers: { default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" } },
      });
      return createPublicClient({
        chain,
        transport: http(RPC, { batch: false, timeout: 12_000, retryCount: 0, fetchFn: fetchBounded }),
      });
    })();
  }
  return clientPromise;
}

let rpcFailures = 0;
let rpcSample: string | null = null;

function shortError(error: unknown): string {
  return describeError(error).slice(0, 500);
}

function httpStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const status = (error as { status?: unknown }).status;
  if (status === 429) return 429;
  if (typeof status === "number") return status;
  return null;
}

function describeError(error: unknown): string {
  if (error instanceof BaseError) {
    const parts = [error.shortMessage || error.message];
    const status = httpStatus(error);
    if (status) parts.push(`http ${status}`);
    const url = (error as { url?: string }).url;
    if (url) parts.push(url);
    if (error.details) parts.push(String(error.details).slice(0, 300));
    return parts.join(" | ").replace(/\s+/g, " ");
  }
  if (!(error instanceof Error)) return String(error ?? "failed");
  const parts = [`${error.name}: ${error.message}`];
  const status = httpStatus(error);
  if (status) parts.push(`http ${status}`);
  let cause: unknown = error.cause;
  for (let depth = 0; cause && depth < 4; depth++) {
    parts.push(cause instanceof Error ? `cause: ${cause.message}` : `cause: ${String(cause)}`);
    cause = cause instanceof Error ? cause.cause : undefined;
  }
  return parts.join(" | ").replace(/\s+/g, " ");
}

function isRateLimit(error: unknown): boolean {
  if (httpStatus(error) === 429) return true;
  const text = error instanceof Error ? error.message : String(error ?? "");
  return text.includes("429");
}

function isRevert(error: unknown): boolean {
  return error instanceof BaseError && error.walk((item) => item instanceof ContractFunctionRevertedError) != null;
}

async function readOrNull<T>(fn: () => Promise<T>): Promise<T | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (isRevert(error) || attempt === 1) {
        if (!isRevert(error)) {
          rpcFailures += 1;
          rpcSample ??= shortError(error);
        }
        return null;
      }
      await sleep(300 * 2 ** attempt);
    }
  }
  return null;
}

type RpcCall = {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
};

let multicallReady: boolean | null = null;

async function ensureMulticall(c: PublicClient): Promise<boolean> {
  if (multicallReady != null) return multicallReady;
  const code = await readOrNull(() => c.getCode({ address: MULTICALL3 }));
  multicallReady = Boolean(code && code !== "0x");
  return multicallReady;
}

async function aggregate(c: PublicClient, calls: RpcCall[]): Promise<unknown[]> {
  const out: unknown[] = new Array(calls.length).fill(null);
  const size = 40;

  async function runSlice(offset: number, slice: RpcCall[]): Promise<void> {
    if (slice.length === 0) return;
    const encoded = slice.map((call) => ({
      target: call.address,
      allowFailure: true,
      callData: encodeFunctionData({
        abi: call.abi,
        functionName: call.functionName,
        args: call.args ?? [],
      } as Parameters<typeof encodeFunctionData>[0]),
    }));
    const rows = await (async (): Promise<ReadonlyArray<{ success: boolean; returnData: `0x${string}` }> | null> => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          return (await c.readContract({
            address: MULTICALL3,
            abi: multicallAbi,
            functionName: "aggregate3",
            args: [encoded],
          })) as ReadonlyArray<{ success: boolean; returnData: `0x${string}` }>;
        } catch (error) {
          if (isRateLimit(error)) console.error(`rpc 429 on multicall of ${slice.length}: ${describeError(error)}`);
          if (attempt < 2) {
            await sleep((isRateLimit(error) ? 1_500 : 400) * 2 ** attempt);
            continue;
          }
          console.error(`multicall failed (${slice.length} calls): ${describeError(error)}`);
          if (slice.length === 1) {
            rpcFailures += 1;
            rpcSample ??= shortError(error);
            return null;
          }
          const mid = Math.ceil(slice.length / 2);
          await runSlice(offset, slice.slice(0, mid));
          await runSlice(offset + mid, slice.slice(mid));
          return null;
        }
      }
      return null;
    })();
    if (!rows) return;
    rows.forEach((row, j) => {
      if (!row.success || row.returnData === "0x") return;
      try {
        out[offset + j] = decodeFunctionResult({
          abi: slice[j].abi,
          functionName: slice[j].functionName,
          data: row.returnData,
        } as Parameters<typeof decodeFunctionResult>[0]);
      } catch {
        out[offset + j] = null;
      }
    });
  }

  for (let i = 0; i < calls.length; i += size) {
    await runSlice(i, calls.slice(i, i + size));
    if (i + size < calls.length) await sleep(40);
  }
  return out;
}

async function readAllMeta(c: PublicClient, instruments: InstrumentRow[]) {
  const map = new Map<number, Awaited<ReturnType<typeof readTokenMeta>>>();
  const blank = () => ({ symbol: null, name: null, decimals: null, uiMultiplier: null, oraclePaused: null });
  if (!(await ensureMulticall(c))) {
    const rows = await mapPool(instruments, 2, async (row) => [row.id, await readTokenMeta(c, getAddress(row.address))] as const);
    for (const [id, meta] of rows) map.set(id, meta);
    return map;
  }
  const calls: Array<RpcCall & { id: number; field: "symbol" | "name" | "decimals" | "uiMultiplier" | "oraclePaused" }> = [];
  for (const row of instruments) {
    const address = getAddress(row.address);
    calls.push(
      { id: row.id, field: "symbol", address, abi: erc20Abi, functionName: "symbol" },
      { id: row.id, field: "name", address, abi: erc20Abi, functionName: "name" },
      { id: row.id, field: "decimals", address, abi: erc20Abi, functionName: "decimals" },
      { id: row.id, field: "uiMultiplier", address, abi: multiplierAbi, functionName: "uiMultiplier" },
      { id: row.id, field: "oraclePaused", address, abi: multiplierAbi, functionName: "oraclePaused" },
    );
  }
  const decoded = await aggregate(c, calls);
  for (const row of instruments) map.set(row.id, blank());
  calls.forEach((call, index) => {
    try {
      const meta = map.get(call.id);
      const value = decoded[index];
      if (!meta || value == null) return;
      if (call.field === "symbol" || call.field === "name") meta[call.field] = String(value);
      else if (call.field === "decimals") meta.decimals = Number(value);
      else if (call.field === "uiMultiplier") meta.uiMultiplier = value as bigint;
      else meta.oraclePaused = Boolean(value);
    } catch (error) {
      rpcFailures += 1;
      rpcSample ??= shortError(error);
    }
  });
  return map;
}

async function readAllOracles(c: PublicClient, instruments: InstrumentRow[]) {
  const map = new Map<number, { price: number; updatedAt: Date; decimals: number } | null>();
  const targets = instruments.filter((row) => row.chainlink_feed);
  if (!(await ensureMulticall(c))) {
    const reads = await mapPool(targets, 2, async (row) => {
      const read = await readFeed(c, getAddress(row.chainlink_feed!), row.feed_decimals);
      return [row.id, read] as const;
    });
    for (const [id, read] of reads) map.set(id, read);
    return map;
  }
  const calls: RpcCall[] = [];
  for (const row of targets) {
    const address = getAddress(row.chainlink_feed!);
    calls.push(
      { address, abi: feedAbi, functionName: "latestRoundData" },
      { address, abi: feedAbi, functionName: "decimals" },
    );
  }
  const decoded = await aggregate(c, calls);
  targets.forEach((row, index) => {
    try {
      const round = decoded[index * 2] as [bigint, bigint, bigint, bigint, bigint] | null;
      const onchainDecimals = decoded[index * 2 + 1];
      const decimals = onchainDecimals == null ? row.feed_decimals : Number(onchainDecimals);
      if (!round || decimals == null) {
        map.set(row.id, null);
        return;
      }
      const [roundId, answer, , updatedAt, answeredInRound] = round;
      const price = decodeOraclePrice({ roundId, answer, updatedAt, answeredInRound, decimals });
      map.set(row.id, price ? { ...price, decimals } : null);
    } catch (error) {
      rpcFailures += 1;
      rpcSample ??= shortError(error);
      map.set(row.id, null);
    }
  });
  return map;
}

export async function runTick(): Promise<TickResult> {
  const started = Date.now();
  const errors: string[] = [];
  rpcFailures = 0;
  rpcSample = null;
  await getDb();
  await seedVenues();
  const now = new Date();

  let assets: Asset[] = [];
  try {
    const body = AssetsSchema.parse(await withRetry(() => fetchJson(ASSETS_URL)));
    assets = body.assets.filter((asset) => asset.deployments.some((d) => d.chainId === CHAIN_ID));
  } catch (error) {
    errors.push(`universe: ${shortError(error)}`);
  }

  if (assets.length > 0) {
    await upsertUniverse(assets, now);
  }
  console.log(`universe ${assets.length}`);

  let feeds: Feed[] = [];
  try {
    feeds = z.array(FeedSchema).parse(await withRetry(() => fetchJson(FEEDS_URL)));
    await matchFeeds(feeds);
  } catch (error) {
    errors.push(`feeds: ${shortError(error)}`);
  }

  const instruments = await q<InstrumentRow>(
    `SELECT id, asset_id, equity_id, address, symbol, current_multiplier::text, chainlink_feed,
            feed_decimals, feed_heartbeat_s, all_day_tradability, status, onchain_symbol,
            onchain_decimals, ui_multiplier::text, oracle_paused
     FROM instruments WHERE chain_id = $1 AND delisted_at IS NULL ORDER BY symbol`,
    [CHAIN_ID],
  );

  const c = await client();
  const chainMeta = new Map<number, Awaited<ReturnType<typeof readTokenMeta>>>();
  try {
    const rows = await readAllMeta(c, instruments);
    for (const [id, meta] of rows) chainMeta.set(id, meta);
    await persistTokenMeta(chainMeta);
    console.log(`meta ${[...chainMeta.values()].filter((meta) => meta?.symbol).length}/${instruments.length}`);
  } catch (error) {
    errors.push(`token meta: ${shortError(error)}`);
  }

  const oracleById = new Map<number, { price: number; updatedAt: Date; decimals: number } | null>();
  try {
    const reads = await readAllOracles(c, instruments);
    for (const [id, read] of reads) oracleById.set(id, read);
    console.log(`oracle ${[...oracleById.values()].filter((read) => read != null).length}`);
  } catch (error) {
    errors.push(`oracle: ${shortError(error)}`);
  }

  try {
    const missing = instruments.filter((row) => row.chainlink_feed && oracleById.get(row.id) == null);
    if (missing.length) {
      const prior = await lastOracleByInstrument();
      let filled = 0;
      for (const row of missing) {
        const prev = prior.get(row.id);
        if (!prev) continue;
        oracleById.set(row.id, { ...prev, decimals: row.feed_decimals ?? 8 });
        filled += 1;
      }
      if (filled) console.log(`oracle last-good ${filled}`);
    }
  } catch (error) {
    errors.push(`oracle last-good: ${shortError(error)}`);
  }

  const peg = await readPegs(c, feeds);

  let uniswapDown = false;
  let pools: PoolSnap[] = [];
  let uniswapError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      pools = await discoverAndSnapshot(c, instruments, peg);
      console.log(`pools ${pools.length} peg=${peg.usdgUsd ?? "—"} eth=${peg.ethUsd ?? "—"}`);
      uniswapError = null;
      break;
    } catch (error) {
      uniswapError = error;
      if (attempt < 2) await sleep(2_000 * (attempt + 1));
    }
  }
  if (uniswapError) {
    uniswapDown = true;
    const detail = describeError(uniswapError);
    console.error(`uniswap adapter down: ${detail}`);
    errors.push(`uniswap: ${detail}`);
    try {
      pools = await lastPricedPools();
      console.log(`uniswap last-good pools ${pools.length}`);
    } catch (error) {
      pools = [];
      errors.push(`uniswap last-good: ${shortError(error)}`);
    }
  }

  const quotes = new Map<string, z.infer<typeof QuoteSchema> | null>();
  try {
    const priced = await mapPool(instruments, 6, async (row) => {
      const quote = await readReference(row.symbol);
      return [row.symbol, quote] as const;
    });
    for (const [symbol, quote] of priced) quotes.set(symbol, quote);
  } catch (error) {
    errors.push(`prices: ${shortError(error)}`);
  }

  try {
    await syncCorporateActions(instruments);
  } catch (error) {
    errors.push(`corporate actions: ${shortError(error)}`);
  }

  await ensureArcusLinks(instruments);

  const counts: Record<string, number> = { FULL: 0, ORACLE_ONLY: 0, DEX_ONLY: 0, LISTED_ONLY: 0, DEGRADED: 0 };
  const ts = new Date();

  for (const row of instruments) {
    try {
      const tier = await writeInstrument({ row, now: ts, chainMeta: chainMeta.get(row.id) ?? null, oracle: oracleById.get(row.id) ?? null, pools, uniswapDown, quote: quotes.get(row.symbol) ?? null, peg });
      counts[tier] = (counts[tier] ?? 0) + 1;
    } catch (error) {
      counts.DEGRADED += 1;
      errors.push(`${row.symbol}: ${error instanceof Error ? error.message : "row failed"}`);
    }
  }

  const tickMs = Date.now() - started;
  const previous = await oneMeta();
  const previousFull = Number(previous?.FULL ?? NaN);
  if (Number.isFinite(previousFull) && previousFull > 0 && counts.FULL < previousFull * 0.8) {
    console.error(`XPLOT FULL dropped more than 20% (${previousFull} -> ${counts.FULL})`);
  }

  const symbolOk = [...chainMeta.values()].filter((meta) => meta?.symbol).length;
  if (instruments.length > 0 && symbolOk < instruments.length) {
    errors.push(`token meta: symbol() read ${symbolOk}/${instruments.length}`);
  }
  const feedRows = instruments.filter((row) => row.chainlink_feed).length;
  const oracleOk = [...oracleById.values()].filter((read) => read != null).length;
  if (feedRows > 0 && oracleOk < feedRows) errors.push(`oracle: readable ${oracleOk}/${feedRows}`);
  if (rpcFailures > 0) errors.push(`rpc failures ${rpcFailures}: ${rpcSample ?? "unknown"}`);

  const withFeed = instruments.filter((row) => row.chainlink_feed).length;
  const withMarket = (counts.FULL ?? 0) + (counts.DEX_ONLY ?? 0);
  const log = `tokens=${instruments.length} with_feed=${withFeed} with_market=${withMarket} FULL=${counts.FULL ?? 0} ORACLE_ONLY=${counts.ORACLE_ONLY ?? 0} DEX_ONLY=${counts.DEX_ONLY ?? 0} LISTED_ONLY=${counts.LISTED_ONLY ?? 0} DEGRADED=${counts.DEGRADED ?? 0} errors=${errors.length} tick_ms=${tickMs}`;
  console.log(log);
  if (errors.length) console.error(errors.slice(0, 12).join(" | "));

  await q(
    `INSERT INTO meta (key, value, updated_at) VALUES ('last_tick', $1::jsonb, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [JSON.stringify({ counts, tickMs, errors, at: ts.toISOString(), tokens: instruments.length, peg, uniswapDown })],
  );

  await writeCoverageReport(counts, instruments.length, ts, errors);
  return { ok: errors.length === 0, tickMs, counts, errors, log };
}

async function seedVenues() {
  const venues = [
    ["uniswap-v3", "amm", "spot", "https://app.uniswap.org", "onchain"],
    ["arcus-spot", "router", "reference", "https://app.arcus.xyz", "link_only"],
  ];
  for (const [id, kind, lane, url, readPath] of venues) {
    await q(
      `INSERT INTO venues (id, kind, lane, url, read_path) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (id) DO UPDATE SET kind = EXCLUDED.kind, lane = EXCLUDED.lane, url = EXCLUDED.url, read_path = EXCLUDED.read_path`,
      [id, kind, lane, url, readPath],
    );
  }
}

async function upsertUniverse(assets: Asset[], now: Date) {
  const seen = new Set<string>();
  for (const asset of assets) {
    try {
    const deployment = asset.deployments.find((d) => d.chainId === CHAIN_ID);
    if (!deployment) continue;
    const ticker = asset.tokenSymbol.toUpperCase();
    const equityId = `EQ:US:${ticker}`;
    seen.add(asset.id);
    await q(
      `INSERT INTO equities (id, ticker, name, asset_class, exchange) VALUES ($1,$2,$3,$4,NULL)
       ON CONFLICT (id) DO UPDATE SET ticker = EXCLUDED.ticker, name = EXCLUDED.name, asset_class = EXCLUDED.asset_class`,
      [equityId, ticker, asset.tokenName, isEtfName(asset.tokenName) ? "etf" : "stock"],
    );
    const pending = numOrNull(asset.pendingMultiplier);
    const effective = asset.pendingMultiplierEffectiveTime ? new Date(asset.pendingMultiplierEffectiveTime) : null;
    await q(
      `INSERT INTO instruments (
         asset_id, equity_id, chain_id, address, symbol, decimals, instrument_type, status,
         current_multiplier, pending_multiplier, pending_effective_at, all_day_tradability,
         fractional_tradability, logo_url, isin, delisted_at
       ) VALUES ($1,$2,$3,$4,$5,$6,'issuer_note',$7,$8,$9,$10,$11,$12,$13,$14,NULL)
       ON CONFLICT (asset_id) DO UPDATE SET
         equity_id = EXCLUDED.equity_id, address = EXCLUDED.address, symbol = EXCLUDED.symbol,
         status = EXCLUDED.status, current_multiplier = EXCLUDED.current_multiplier,
         pending_multiplier = EXCLUDED.pending_multiplier, pending_effective_at = EXCLUDED.pending_effective_at,
         all_day_tradability = EXCLUDED.all_day_tradability, fractional_tradability = EXCLUDED.fractional_tradability,
         logo_url = EXCLUDED.logo_url, isin = EXCLUDED.isin, delisted_at = NULL`,
      [
        asset.id,
        equityId,
        CHAIN_ID,
        getAddress(deployment.contractAddress),
        ticker,
        asset.tokenDecimals ?? 18,
        asset.status,
        numOrNull(asset.currentMultiplier),
        pending,
        effective && !Number.isNaN(effective.getTime()) ? effective.toISOString() : null,
        overnightTradable(asset) ? "TRADING_STATUS_TRADABLE" : asset.tradingCapabilities?.overnight?.whole ?? null,
        asset.tradingCapabilities?.market?.fractional ?? null,
        asset.logoUrl ?? null,
        asset.isin ?? null,
      ],
    );
    } catch (error) {
      console.error(`token ${asset.tokenSymbol}: ${shortError(error)}`);
    }
  }
  if (seen.size > 0) {
    await q(
      `UPDATE instruments SET delisted_at = $1 WHERE chain_id = $2 AND delisted_at IS NULL AND NOT (asset_id = ANY($3::text[]))`,
      [now.toISOString(), CHAIN_ID, [...seen]],
    );
  }
}

async function matchFeeds(feeds: Feed[]) {
  const byTicker = new Map<string, Feed>();
  for (const feed of feeds) {
    const ticker = tickerFromEquityFeed(feed.name, feed.docs?.marketHours);
    if (!ticker || byTicker.has(ticker)) continue;
    byTicker.set(ticker, feed);
  }
  const rows = await q<{ id: number; symbol: string }>(`SELECT id, symbol FROM instruments WHERE delisted_at IS NULL`);
  for (const row of rows) {
    try {
      const feed = byTicker.get(row.symbol);
      if (!feed) {
        await q(`UPDATE instruments SET chainlink_feed = NULL, feed_decimals = NULL, feed_heartbeat_s = NULL WHERE id = $1`, [row.id]);
        continue;
      }
      await q(
        `UPDATE instruments SET chainlink_feed = $2, feed_decimals = $3, feed_heartbeat_s = $4 WHERE id = $1`,
        [row.id, getAddress(feed.proxyAddress), feed.decimals, feed.heartbeat],
      );
    } catch (error) {
      console.error(`feed ${row.symbol}: ${shortError(error)}`);
    }
  }
}

async function readTokenMeta(c: PublicClient, address: Address) {
  const [symbol, name, decimals, uiMultiplier, oraclePaused] = await Promise.all([
    readOrNull(() => c.readContract({ address, abi: erc20Abi, functionName: "symbol" })),
    readOrNull(() => c.readContract({ address, abi: erc20Abi, functionName: "name" })),
    readOrNull(() => c.readContract({ address, abi: erc20Abi, functionName: "decimals" })),
    readOrNull(() => c.readContract({ address, abi: multiplierAbi, functionName: "uiMultiplier" })),
    readOrNull(() => c.readContract({ address, abi: multiplierAbi, functionName: "oraclePaused" })),
  ]);
  return { symbol, name, decimals, uiMultiplier, oraclePaused };
}

async function persistTokenMeta(rows: Map<number, Awaited<ReturnType<typeof readTokenMeta>>>) {
  for (const [id, meta] of rows) {
    try {
    const multiplier = meta.uiMultiplier == null ? null : Number(meta.uiMultiplier) / 1e18;
    await q(
      `UPDATE instruments SET onchain_symbol = $2, onchain_name = $3, onchain_decimals = $4, ui_multiplier = $5, oracle_paused = $6 WHERE id = $1`,
      [id, meta.symbol, meta.name, meta.decimals, multiplier, meta.oraclePaused],
    );
    } catch (error) {
      console.error(`token meta ${id}: ${shortError(error)}`);
    }
  }
}

async function readFeed(c: PublicClient, address: Address, fallbackDecimals?: number | null) {
  const round = await readOrNull(() => c.readContract({ address, abi: feedAbi, functionName: "latestRoundData" }));
  const decimals = await readOrNull(() => c.readContract({ address, abi: feedAbi, functionName: "decimals" }));
  const resolved = decimals == null ? fallbackDecimals : Number(decimals);
  if (!round || resolved == null) return null;
  const [roundId, answer, , updatedAt, answeredInRound] = round;
  const decoded = decodeOraclePrice({
    roundId,
    answer,
    updatedAt,
    answeredInRound,
    decimals: resolved,
  });
  return decoded ? { ...decoded, decimals: resolved } : null;
}

async function readPegs(c: PublicClient, feeds: Feed[]) {
  const find = (name: string) => feeds.find((feed) => feed.name.toLowerCase() === name.toLowerCase());
  const usdg = find("USDG / USD");
  const eth = find("ETH / USD");
  const usdgRead = usdg ? await readFeed(c, getAddress(usdg.proxyAddress), usdg.decimals) : null;
  const ethRead = eth ? await readFeed(c, getAddress(eth.proxyAddress), eth.decimals) : null;
  return {
    usdgUsd: usdgRead?.price ?? null,
    ethUsd: ethRead?.price ?? null,
    usdgOffPeg: usdgRead != null && Math.abs(usdgRead.price - 1) > 0.005,
  };
}

type PoolSnap = {
  instrumentId: number;
  pool: string;
  quoteSymbol: string;
  quoteAddress: string;
  fee: number;
  priceUsd: number | null;
  tvlUsd: number | null;
  depthUsd: number | null;
  impact: Record<number, number | null>;
  token0: string;
  token1: string;
  /** When set, eligibility uses this print time. A live read leaves it unset. */
  asOf?: string | null;
};

async function lastOracleByInstrument() {
  const rows = await q<{ instrument_id: number; price: string; oracle_updated_at: string }>(
    `SELECT DISTINCT ON (instrument_id) instrument_id, price::text, oracle_updated_at::text
     FROM oracle_snapshots
     ORDER BY instrument_id, ts DESC`,
  );
  const map = new Map<number, { price: number; updatedAt: Date }>();
  for (const row of rows) {
    const price = num(row.price);
    const updatedAt = new Date(row.oracle_updated_at);
    if (price == null || Number.isNaN(updatedAt.getTime())) continue;
    map.set(row.instrument_id, { price, updatedAt });
  }
  return map;
}

async function lastPricedPools(): Promise<PoolSnap[]> {
  const rows = await q<{
    instrument_id: number;
    pool_address: string | null;
    quote_symbol: string | null;
    quote_address: string | null;
    fee_bps: number | null;
    price_usd_per_token: string | null;
    tvl_usd: string | null;
    depth_1pct_usd: string | null;
    ts: string;
  }>(
    `SELECT m.instrument_id, m.pool_address, m.quote_symbol, m.quote_address, m.fee_bps,
            s.price_usd_per_token::text, s.tvl_usd::text, s.depth_1pct_usd::text, s.ts::text
     FROM markets m
     JOIN venues v ON v.id = m.venue_id AND v.lane = 'spot'
     JOIN LATERAL (
       SELECT price_usd_per_token, tvl_usd, depth_1pct_usd, ts
       FROM market_snapshots s
       WHERE s.market_id = m.id AND s.price_usd_per_token IS NOT NULL
       ORDER BY ts DESC
       LIMIT 1
     ) s ON true`,
  );
  return rows.map((row) => ({
    instrumentId: row.instrument_id,
    pool: row.pool_address ?? "",
    quoteSymbol: row.quote_symbol ?? "",
    quoteAddress: row.quote_address ?? "",
    fee: row.fee_bps ?? 0,
    priceUsd: num(row.price_usd_per_token),
    tvlUsd: num(row.tvl_usd),
    depthUsd: num(row.depth_1pct_usd),
    impact: { 1000: null, 10000: null, 50000: null },
    token0: "",
    token1: "",
    asOf: row.ts,
  }));
}

type QuoteToken = { symbol: string; address: Address; decimals: number; usd: number | null };

type LivePool = {
  row: InstrumentRow;
  quote: QuoteToken;
  fee: number;
  pool: Address;
  token0: Address;
  token1: Address;
};

async function discoverAndSnapshot(
  c: PublicClient,
  instruments: InstrumentRow[],
  peg: { usdgUsd: number | null; ethUsd: number | null; usdgOffPeg: boolean },
): Promise<PoolSnap[]> {
  const deployments = (await withRetry(() => fetchJson(UNISWAP_DEPLOYMENTS_URL))) as {
    latest?: Record<string, { address?: string; deploymentTxn?: `0x${string}` }>;
  };
  const factory = deployments.latest?.UniswapV3Factory?.address;
  const quoter = deployments.latest?.QuoterV2?.address;
  if (!factory || !quoter) throw new Error("Uniswap deployments JSON has no V3 factory or QuoterV2");
  const factoryAddress = getAddress(factory);
  const quoterAddress = getAddress(quoter);
  const factoryCode = await withRetry(() => c.getCode({ address: factoryAddress }));
  const quoterCode = await withRetry(() => c.getCode({ address: quoterAddress }));
  if (!factoryCode || factoryCode === "0x") throw new Error(`Uniswap V3 factory ${factoryAddress} has no bytecode`);
  if (!quoterCode || quoterCode === "0x") throw new Error(`QuoterV2 ${quoterAddress} has no bytecode`);
  const factoryBytes = (factoryCode.length - 2) / 2;
  const quoterBytes = (quoterCode.length - 2) / 2;
  console.log(`uniswap health factory ${factoryAddress} bytecode ${factoryBytes} quoter ${quoterAddress} bytecode ${quoterBytes} source ${UNISWAP_DEPLOYMENTS_URL}`);

  const quotes: QuoteToken[] = [];
  for (const candidate of QUOTE_CANDIDATES) {
    const address = getAddress(candidate.address);
    const symbol = await readOrNull(() => c.readContract({ address, abi: erc20Abi, functionName: "symbol" }));
    const decimals = await readOrNull(() => c.readContract({ address, abi: erc20Abi, functionName: "decimals" }));
    if (symbol !== candidate.symbol || decimals == null) continue;
    const usd = candidate.symbol === "USDG" ? peg.usdgUsd : candidate.symbol === "WETH" ? peg.ethUsd : null;
    quotes.push({ symbol: candidate.symbol, address, decimals: Number(decimals), usd });
  }
  if (quotes.length === 0) throw new Error("No quote token passed symbol() verification");

  const factoryAbi = parseAbi(["function getPool(address tokenA, address tokenB, uint24 fee) view returns (address)"]);
  const fees = [100, 500, 3000, 10000];
  const jobs: Array<RpcCall & { row: InstrumentRow; quote: QuoteToken; fee: number }> = [];
  for (const row of instruments) {
    const stock = getAddress(row.address);
    for (const quote of quotes) {
      for (const fee of fees) {
        jobs.push({
          row,
          quote,
          fee,
          address: factoryAddress,
          abi: factoryAbi,
          functionName: "getPool",
          args: [stock, quote.address, fee],
        });
      }
    }
  }
  console.log(`pool queries ${jobs.length}`);
  const found = await aggregate(c, jobs);
  const zero = "0x0000000000000000000000000000000000000000";
  const seen = new Set<string>();
  const live: LivePool[] = [];
  jobs.forEach((job, index) => {
    const pool = found[index];
    if (typeof pool !== "string" || pool.toLowerCase() === zero) return;
    const address = getAddress(pool as Address);
    if (seen.has(address.toLowerCase())) return;
    seen.add(address.toLowerCase());
    const stock = getAddress(job.row.address);
    const token0 = stock.toLowerCase() < job.quote.address.toLowerCase() ? stock : job.quote.address;
    const token1 = token0.toLowerCase() === stock.toLowerCase() ? job.quote.address : stock;
    live.push({ row: job.row, quote: job.quote, fee: job.fee, pool: address, token0, token1 });
  });
  console.log(`matched pools ${live.length}`);

  const calls: RpcCall[] = [];
  for (const pool of live) {
    if (pool.quote.usd == null) continue;
    const stock = getAddress(pool.row.address);
    calls.push(
      { address: pool.pool, abi: poolAbi, functionName: "slot0" },
      { address: pool.pool, abi: poolAbi, functionName: "liquidity" },
      { address: stock, abi: erc20Abi, functionName: "balanceOf", args: [pool.pool] },
      { address: pool.quote.address, abi: erc20Abi, functionName: "balanceOf", args: [pool.pool] },
    );
  }
  console.log(`pool state calls ${calls.length}`);
  const decoded = calls.length && (await ensureMulticall(c)) ? await aggregate(c, calls) : [];
  let cursor = 0;
  const snaps: PoolSnap[] = [];
  for (const pool of live) {
    const hasQuote = pool.quote.usd != null;
    try {
      if (!hasQuote) {
        snaps.push(emptySnap(pool));
        continue;
      }
      const slot0 = decoded[cursor] as readonly [bigint, ...unknown[]] | null;
      const liquidity = decoded[cursor + 1] as bigint | null;
      const stockBal = decoded[cursor + 2] as bigint | null;
      const quoteBal = decoded[cursor + 3] as bigint | null;
      snaps.push(priceSnap(pool, slot0?.[0] ?? null, liquidity, stockBal, quoteBal) ?? emptySnap(pool));
    } catch (error) {
      rpcFailures += 1;
      rpcSample ??= shortError(error);
      console.error(`pool ${pool.pool}: ${describeError(error)}`);
      snaps.push(emptySnap(pool));
    } finally {
      if (hasQuote) cursor += 4;
    }
  }
  const priced = snaps.filter((snap) => snap.priceUsd != null).length;
  console.log(`priced pools ${priced}/${snaps.length}`);
  if (live.length > 0 && priced === 0) {
    throw new Error(`state reads priced 0/${live.length} pools; rpcFailures=${rpcFailures}; ${rpcSample ?? "no rpc error captured"}`);
  }

  console.log("quoting primaries");
  await quotePrimaries(c, quoterAddress, snaps, quotes);
  for (const snap of snaps) await saveSnap(snap, peg.usdgOffPeg);
  return snaps;
}

function emptySnap(pool: LivePool): PoolSnap {
  return {
    instrumentId: pool.row.id,
    pool: pool.pool,
    quoteSymbol: pool.quote.symbol,
    quoteAddress: pool.quote.address,
    fee: pool.fee,
    priceUsd: null,
    tvlUsd: null,
    depthUsd: null,
    impact: { 1000: null, 10000: null, 50000: null },
    token0: pool.token0,
    token1: pool.token1,
  };
}

function priceSnap(
  pool: LivePool,
  sqrtPriceX96: bigint | null,
  liquidity: bigint | null,
  stockBal: bigint | null,
  quoteBal: bigint | null,
): PoolSnap | null {
  if (sqrtPriceX96 == null || pool.quote.usd == null) return null;
  const stock = getAddress(pool.row.address);
  const stockIs0 = pool.token0.toLowerCase() === stock.toLowerCase();
  const human = priceOfToken0InToken1(
    sqrtPriceX96,
    stockIs0 ? 18 : pool.quote.decimals,
    stockIs0 ? pool.quote.decimals : 18,
  );
  if (human == null) return null;
  const quotePerStock = stockIs0 ? human : 1 / human;
  const priceUsd = quotePerStock * pool.quote.usd;
  const stockUnits = stockBal == null ? null : Number(stockBal) / 1e18;
  const quoteUnits = quoteBal == null ? null : Number(quoteBal) / 10 ** pool.quote.decimals;
  const tvlUsd = stockUnits != null && quoteUnits != null ? stockUnits * priceUsd + quoteUnits * pool.quote.usd : null;
  const depthUsd =
    liquidity == null
      ? null
      : inRangeDepthUsd({
          liquidity,
          sqrtPriceX96,
          token0IsQuote: pool.token0.toLowerCase() === pool.quote.address.toLowerCase(),
          quoteUsd: pool.quote.usd,
          quoteDecimals: pool.quote.decimals,
          tokenDecimals: 18,
        });
  return {
    instrumentId: pool.row.id,
    pool: pool.pool,
    quoteSymbol: pool.quote.symbol,
    quoteAddress: pool.quote.address,
    fee: pool.fee,
    priceUsd,
    tvlUsd,
    depthUsd,
    impact: { 1000: null, 10000: null, 50000: null },
    token0: pool.token0,
    token1: pool.token1,
  };
}

async function quotePrimaries(c: PublicClient, quoter: Address, snaps: PoolSnap[], quotes: QuoteToken[]) {
  const byInstrument = new Map<number, PoolSnap[]>();
  for (const snap of snaps) {
    const list = byInstrument.get(snap.instrumentId) ?? [];
    list.push(snap);
    byInstrument.set(snap.instrumentId, list);
  }
  const primaries = [...byInstrument.values()]
    .map((group) =>
      group
        .filter((pool) => pool.priceUsd != null && (pool.tvlUsd ?? 0) >= 1000)
        .sort((a, b) => (b.depthUsd ?? -1) - (a.depthUsd ?? -1))[0],
    )
    .filter((pool): pool is PoolSnap => pool != null);
  console.log(`quote primaries ${primaries.length}`);
  if (!primaries.length || !(await ensureMulticall(c))) return;
  const quoteBy = new Map(quotes.map((quote) => [quote.address.toLowerCase(), quote]));
  const stockByPool = new Map(snaps.map((snap) => [snap.pool.toLowerCase(), snap]));
  const calls: Array<RpcCall & { snap: PoolSnap; notional: number }> = [];
  for (const snap of primaries) {
    const quote = quoteBy.get(snap.quoteAddress.toLowerCase());
    const stock = stockByPool.get(snap.pool.toLowerCase());
    if (!quote?.usd || !snap.priceUsd || !stock) continue;
    for (const notional of [1000, 10_000, 50_000]) {
      const amountIn = BigInt(Math.max(1, Math.round((notional / quote.usd) * 10 ** quote.decimals)));
      calls.push({
        snap,
        notional,
        address: quoter,
        abi: quoterAbi,
        functionName: "quoteExactInputSingle",
        args: [{ tokenIn: quote.address, tokenOut: getAddress(snap.token0.toLowerCase() === quote.address.toLowerCase() ? snap.token1 : snap.token0), amountIn, fee: snap.fee, sqrtPriceLimitX96: 0n }],
      });
    }
  }
  const decoded = await aggregate(c, calls);
  calls.forEach((call, index) => {
    const result = decoded[index] as readonly [bigint, ...unknown[]] | null;
    const quote = quoteBy.get(call.snap.quoteAddress.toLowerCase());
    if (!result || !quote?.usd || !call.snap.priceUsd) return;
    const tokens = Number(result[0]) / 1e18;
    if (!(tokens > 0)) return;
    const exec = call.notional / tokens;
    call.snap.impact[call.notional] = ((exec - call.snap.priceUsd) / call.snap.priceUsd) * 10_000;
  });
}

async function saveSnap(snap: PoolSnap, usdgOffPeg: boolean) {
  const marketId = await upsertMarket(snap.instrumentId, snap.quoteSymbol, snap.quoteAddress, snap.pool, snap.fee);
  await q(
    `INSERT INTO market_snapshots (market_id, ts, price_usd_per_token, tvl_usd, depth_1pct_usd, impact_1k_bps, impact_10k_bps, impact_50k_bps, extra)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
     ON CONFLICT (market_id, ts) DO NOTHING`,
    [
      marketId,
      new Date().toISOString(),
      snap.priceUsd,
      snap.tvlUsd,
      snap.depthUsd,
      snap.impact[1000],
      snap.impact[10000],
      snap.impact[50000],
      JSON.stringify({
        depthMethod: "in_range_lower_bound",
        feeTier: snap.fee,
        quoteOffPeg: snap.quoteSymbol === "USDG" ? usdgOffPeg : false,
      }),
    ],
  );
}

async function upsertMarket(instrumentId: number, quoteSymbol: string, quoteAddress: string, pool: string, fee: number) {
  const rows = await q<{ id: number }>(
    `INSERT INTO markets (venue_id, instrument_id, quote_symbol, quote_address, pool_address, fee_bps, external_symbol)
     VALUES ('uniswap-v3', $1, $2, $3, $4, $5, $6)
     ON CONFLICT (venue_id, instrument_id, quote_symbol, pool_address)
     DO UPDATE SET fee_bps = EXCLUDED.fee_bps
     RETURNING id`,
    [instrumentId, quoteSymbol, quoteAddress, pool, Math.round(fee / 100), `${quoteSymbol} pool`],
  );
  return rows[0].id;
}

async function readReference(symbol: string) {
  try {
    const body = PriceSchema.parse(await withRetry(() => fetchJson(`${PRICES_URL}/${encodeURIComponent(symbol)}`)));
    return "quotes" in body ? body.quotes[0] ?? null : body;
  } catch {
    return null;
  }
}

async function syncCorporateActions(instruments: InstrumentRow[]) {
  const body = z
    .object({
      corpActions: z.array(
        z.object({
          id: z.string(),
          type: z.string().optional(),
          status: z.string().optional(),
          processDate: z.object({ year: z.number(), month: z.number(), day: z.number() }).optional(),
          tokenSymbol: z.string().optional(),
          details: z.unknown().optional(),
        }),
      ),
    })
    .parse(await withRetry(() => fetchJson(ACTIONS_URL)));
  const bySymbol = new Map(instruments.map((row) => [row.symbol, row.id]));
  for (const action of body.corpActions) {
    try {
    const instrumentId = action.tokenSymbol ? bySymbol.get(action.tokenSymbol.toUpperCase()) ?? null : null;
    const date = action.processDate
      ? `${action.processDate.year}-${String(action.processDate.month).padStart(2, "0")}-${String(action.processDate.day).padStart(2, "0")}`
      : null;
    await q(
      `INSERT INTO corporate_actions (id, instrument_id, type, status, process_date, details)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb)
       ON CONFLICT (id) DO UPDATE SET instrument_id = EXCLUDED.instrument_id, type = EXCLUDED.type, status = EXCLUDED.status, process_date = EXCLUDED.process_date, details = EXCLUDED.details`,
      [action.id, instrumentId, action.type ?? null, action.status ?? null, date, JSON.stringify(action.details ?? null)],
    );
    } catch (error) {
      console.error(`corporate action ${action.id}: ${shortError(error)}`);
    }
  }
}

async function ensureArcusLinks(instruments: InstrumentRow[]) {
  for (const row of instruments) {
    try {
      await q(
        `INSERT INTO markets (venue_id, instrument_id, quote_symbol, quote_address, pool_address, external_symbol, deeplink_url)
         VALUES ('arcus-spot', $1, 'USDG', NULL, '', $2, $3)
         ON CONFLICT (venue_id, instrument_id, quote_symbol, pool_address)
         DO UPDATE SET deeplink_url = EXCLUDED.deeplink_url`,
        [row.id, row.symbol, `https://app.arcus.xyz/trade/spot/${row.symbol}`],
      );
    } catch (error) {
      console.error(`link ${row.symbol}: ${shortError(error)}`);
    }
  }
}

async function writeInstrument(input: {
  row: InstrumentRow;
  now: Date;
  chainMeta: Awaited<ReturnType<typeof readTokenMeta>> | null;
  oracle: { price: number; updatedAt: Date } | null;
  pools: PoolSnap[];
  uniswapDown: boolean;
  quote: z.infer<typeof QuoteSchema> | null;
  peg: { usdgUsd: number | null; usdgOffPeg: boolean };
}): Promise<string> {
  const { row, now } = input;
  const meta = input.chainMeta;
  const overnight = row.all_day_tradability === "TRADING_STATUS_TRADABLE";
  const session = resolveSession(now, overnight);
  const multiplier = num(row.current_multiplier);
  const ui = meta?.uiMultiplier == null ? num(row.ui_multiplier) : Number(meta.uiMultiplier) / 1e18;
  const paused = Boolean(meta?.oraclePaused ?? row.oracle_paused);
  const pending = await one<{ pending_multiplier: string | null; pending_effective_at: string | null }>(
    `SELECT pending_multiplier::text, pending_effective_at::text FROM instruments WHERE id = $1`,
    [row.id],
  );
  const effectiveMs = pending?.pending_effective_at ? new Date(pending.pending_effective_at).getTime() : null;
  const alertsPaused =
    paused || (effectiveMs != null && now.getTime() >= effectiveMs - 15 * 60_000 && now.getTime() <= effectiveMs + 30 * 60_000);
  const ageS = input.oracle ? Math.max(0, Math.round((now.getTime() - input.oracle.updatedAt.getTime()) / 1000)) : null;
  const state: OracleState = oracleState({
    ageS,
    heartbeatS: row.feed_heartbeat_s,
    session: session.session,
    overnightTradable: overnight,
    corporateAction: paused,
    readable: input.oracle != null,
  });

  const readSymbol = typeof meta?.symbol === "string" ? meta.symbol : null;
  const knownSymbol = readSymbol ?? row.onchain_symbol;
  const symbolMismatch = knownSymbol != null && knownSymbol.toUpperCase() !== row.symbol.toUpperCase();
  const verified = !symbolMismatch;
  const decimalsMismatch = meta?.decimals != null && Number(meta.decimals) !== 18;
  const ownPools = input.pools.filter((pool) => pool.instrumentId === row.id);
  const belowMin = ownPools.some((pool) => pool.priceUsd != null && (pool.tvlUsd ?? 0) < 1000);
  const agg = aggregateSpot(
    ownPools.map((pool) => ({
      lane: "spot" as const,
      priceUsdPerToken: pool.priceUsd,
      tvlUsd: pool.tvlUsd,
      depth1pctUsd: pool.depthUsd,
      updatedWithinWindow: pool.asOf == null || now.getTime() - new Date(pool.asOf).getTime() <= 5 * 60 * 1000,
    })),
  );
  const classified = classifyTier({
    inactive: row.status === "ASSET_STATUS_INACTIVE",
    verified: verified || (meta == null && row.onchain_symbol?.toUpperCase() === row.symbol.toUpperCase()),
    hasFeed: Boolean(row.chainlink_feed),
    feedReadable: input.oracle != null && state !== "unread",
    oracle: state,
    eligibleSpot: agg.eligibleCount,
    adapterDown: input.uniswapDown,
    decimalsMismatch,
    multiplierMissing: multiplier == null,
    halt: Boolean(input.quote?.isTradingHalt),
    poolsExistBelowMin: belowMin && agg.eligibleCount === 0,
    poolCount: ownPools.length,
  });

  const reasons = [...classified.reasons];
  if (meta?.symbol && meta.symbol.toUpperCase() !== row.symbol.toUpperCase()) reasons.push("SYMBOL_MISMATCH");
  if (ui != null && multiplier != null && !nearlyEqual(ui, multiplier, 1e-6)) reasons.push("MULTIPLIER_MISMATCH");

  const spread = agg.primary != null && input.oracle ? spreadPct(agg.primary, input.oracle.price) : null;
  const primaryPool = ownPools
    .filter((pool) => pool.priceUsd != null && (pool.tvlUsd ?? 0) >= 1000)
    .sort((a, b) => (b.depthUsd ?? -1) - (a.depthUsd ?? -1))[0];
  const impact1k = primaryPool?.impact[1000] ?? null;
  const executable = spread != null && impact1k != null && agg.primary != null && input.oracle
    ? executableSpreadPct(agg.primary, input.oracle.price, impact1k)
    : null;

  const history = await q<{ spread_pct: string | null }>(
    `SELECT spread_pct::text FROM deviations WHERE instrument_id = $1 ORDER BY ts DESC LIMIT 2`,
    [row.id],
  );
  const prior = history.map((item) => num(item.spread_pct)).reverse();
  const threshold = alertThresholdPct(null, session.session);
  const spreadAlert = persistSpreadAlert({
    spreads: [...prior, spread],
    session: session.session,
    oracle: state,
    thresholdPct: threshold,
    halt: Boolean(input.quote?.isTradingHalt),
    alertsPaused,
  });

  let alert: string | null = spreadAlert;
  if (input.quote?.isTradingHalt) alert = "TRADING_HALT";
  else if (state === "stale") alert = "ORACLE_STALE";
  else if (reasons.includes("MULTIPLIER_MISMATCH")) alert = "MULTIPLIER_MISMATCH";

  let oracleVsRef: number | null = null;
  if (input.quote && input.oracle && multiplier != null && multiplier !== 0) {
    const bid = Number(input.quote.bid);
    const ask = Number(input.quote.ask);
    if (Number.isFinite(bid) && Number.isFinite(ask)) {
      const tokenRef = tokenEquivalent((bid + ask) / 2, multiplier);
      oracleVsRef = spreadPct(input.oracle.price, tokenRef);
      if (session.session === "open" && Math.abs(oracleVsRef) > 1) alert = alert ?? "ORACLE_REFERENCE_MISMATCH";
    }
  }

  if (input.oracle) {
    await q(
      `INSERT INTO oracle_snapshots (instrument_id, ts, price, oracle_updated_at, age_s, oracle_state)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
      [row.id, now.toISOString(), input.oracle.price, input.oracle.updatedAt.toISOString(), ageS, state],
    );
  }

  if (input.quote) {
    await q(
      `INSERT INTO reference_quotes (instrument_id, ts, bid, ask, is_trading_halt, generated_at, oracle_vs_reference_pct, daily_volume)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING`,
      [
        row.id,
        now.toISOString(),
        Number(input.quote.bid),
        Number(input.quote.ask),
        input.quote.isTradingHalt,
        input.quote.generatedAt,
        oracleVsRef,
        numOrNull(input.quote.dailyTradingVolume),
      ],
    );
  }

  await q(
    `INSERT INTO deviations (
       instrument_id, ts, dex_price, oracle_price, oracle_age_s, spread_pct, executable_spread_1k_pct,
       session, session_source, oracle_state, liquidity_confidence, venue_dispersion_pct, alert, underlying_price, threshold_pct
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     ON CONFLICT DO NOTHING`,
    [
      row.id,
      now.toISOString(),
      agg.primary,
      input.oracle?.price ?? null,
      ageS,
      spread,
      executable,
      session.session,
      session.source,
      state,
      liquidityConfidence(agg.depth1pctUsd),
      agg.dispersionPct,
      alert,
      input.oracle && multiplier ? input.oracle.price / multiplier : null,
      threshold,
    ],
  );

  let tier = classified.tier;
  if ((reasons.includes("MULTIPLIER_MISMATCH") || reasons.includes("SYMBOL_MISMATCH")) && tier !== "LISTED_ONLY") {
    tier = "DEGRADED";
  }

  await q(
    `INSERT INTO coverage_status (instrument_id, ts, tier, feed_status, pool_count, reasons)
     VALUES ($1,$2,$3,$4,$5,$6::text[]) ON CONFLICT DO NOTHING`,
    [row.id, now.toISOString(), tier, classified.feedStatus, agg.eligibleCount, reasons],
  );

  await syncAlert(row.id, alert, spread, now);
  await syncIssues(row.id, reasons, now);
  return tier;
}

async function syncAlert(instrumentId: number, kind: string | null, spread: number | null, now: Date) {
  const open = await q<{ id: number; kind: string; peak_spread_pct: string | null }>(
    `SELECT id, kind, peak_spread_pct::text FROM alerts WHERE instrument_id = $1 AND resolved_at IS NULL`,
    [instrumentId],
  );
  for (const row of open) {
    if (row.kind !== kind) {
      await q(`UPDATE alerts SET resolved_at = $2 WHERE id = $1`, [row.id, now.toISOString()]);
    }
  }
  if (!kind) return;
  const same = open.find((row) => row.kind === kind);
  if (!same) {
    await q(
      `INSERT INTO alerts (instrument_id, kind, started_at, last_seen_at, peak_spread_pct) VALUES ($1,$2,$3,$3,$4)`,
      [instrumentId, kind, now.toISOString(), spread],
    );
    return;
  }
  const peak = Math.max(Math.abs(num(same.peak_spread_pct) ?? 0), Math.abs(spread ?? 0));
  await q(`UPDATE alerts SET last_seen_at = $2, peak_spread_pct = $3 WHERE id = $1`, [same.id, now.toISOString(), peak]);
}

async function syncIssues(instrumentId: number, reasons: string[], now: Date) {
  const open = await q<{ id: number; code: string }>(
    `SELECT id, code FROM coverage_issues WHERE instrument_id = $1 AND resolved_at IS NULL`,
    [instrumentId],
  );
  for (const row of open) {
    if (!reasons.includes(row.code)) {
      await q(`UPDATE coverage_issues SET resolved_at = $2 WHERE id = $1`, [row.id, now.toISOString()]);
    } else {
      await q(`UPDATE coverage_issues SET last_seen = $2 WHERE id = $1`, [row.id, now.toISOString()]);
    }
  }
  for (const code of reasons) {
    if (open.some((row) => row.code === code)) continue;
    await q(`INSERT INTO coverage_issues (instrument_id, code, detail) VALUES ($1,$2,$3)`, [instrumentId, code, null]);
  }
}

async function oneMeta(): Promise<Record<string, number> | null> {
  const rows = await q<{ value: { counts?: Record<string, number> } }>(`SELECT value FROM meta WHERE key = 'last_tick'`);
  return rows[0]?.value?.counts ?? null;
}

async function one<T extends Record<string, unknown>>(text: string, params: unknown[]): Promise<T | null> {
  const rows = await q<T>(text, params);
  return rows[0] ?? null;
}

async function writeCoverageReport(counts: Record<string, number>, tokens: number, ts: Date, errors: string[]) {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const rows = await q<{ symbol: string; tier: string; reasons: string[] | null; feed_status: string }>(
    `SELECT i.symbol, c.tier, c.reasons, c.feed_status
     FROM instruments i
     JOIN LATERAL (
       SELECT tier, reasons, feed_status FROM coverage_status cs
       WHERE cs.instrument_id = i.id ORDER BY ts DESC LIMIT 1
     ) c ON true
     WHERE i.delisted_at IS NULL AND c.tier <> 'FULL'
     ORDER BY c.tier, i.symbol`,
  );
  const lines = [
    "# Coverage report",
    "",
    `Generated by the collector at ${ts.toISOString()}. Do not edit by hand.`,
    "",
    `| Tier | Count |`,
    `| --- | --- |`,
    `| Listed | ${tokens} |`,
    `| FULL | ${counts.FULL ?? 0} |`,
    `| ORACLE_ONLY | ${counts.ORACLE_ONLY ?? 0} |`,
    `| DEX_ONLY | ${counts.DEX_ONLY ?? 0} |`,
    `| LISTED_ONLY | ${counts.LISTED_ONLY ?? 0} |`,
    `| DEGRADED | ${counts.DEGRADED ?? 0} |`,
    "",
    "## Tokens that are not FULL",
    "",
    "| Symbol | Tier | Feed | Reasons |",
    "| --- | --- | --- | --- |",
    ...rows.map((row) => `| ${row.symbol} | ${row.tier} | ${row.feed_status} | ${(row.reasons ?? []).join(", ") || "—"} |`),
    "",
    errors.length ? `## Tick notes\n\n${errors.map((e) => `- ${e}`).join("\n")}\n` : "",
  ];
  const target = path.join(process.cwd(), "docs", "COVERAGE_REPORT.md");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, lines.join("\n"));
}

export const _sessionForTest = resolveSession;
