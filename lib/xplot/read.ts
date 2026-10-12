import { asTextArray, getDb, num, q } from "../db/client";
import { DISCLAIMER } from "./disclaimer";
import {
  ADAPTER_DOWN_NOTE,
  classifyTier,
  collectorIsStalled,
  collectorStallCopy,
  oracleAgeSeconds,
  oracleState,
  statusWord,
  type OracleState,
  type SessionName,
  type Tier,
} from "./engines";
import { nyseStrip, resolveSession } from "./session";

export type EquitySummary = {
  id: string;
  ticker: string;
  name: string;
  assetClass: "stock" | "etf";
  address: string;
  tier: Tier;
  reasons: string[];
  dexPrice: number | null;
  oraclePrice: number | null;
  oracleAgeS: number | null;
  oracleState: OracleState;
  oracleUpdatedAt: string | null;
  spreadPct: number | null;
  executableSpread1kPct: number | null;
  liquidityConfidence: "high" | "medium" | "low" | null;
  status: ReturnType<typeof statusWord>;
  alert: string | null;
  session: SessionName;
  sessionSource: "overnight_flag" | "calendar";
  underlyingPrice: number | null;
  multiplier: number | null;
  pendingMultiplier: number | null;
  halt: boolean;
  dispersionPct: number | null;
  asOf: string | null;
  feedStatus: string;
  poolCount: number;
  tvlUsd: number | null;
  notes: string[];
};

type SummaryRow = {
  id: string;
  ticker: string;
  name: string;
  asset_class: "stock" | "etf";
  address: string;
  tier: Tier | null;
  reasons: string[] | null;
  dex_price: unknown;
  oracle_price: unknown;
  oracle_age_s: number | null;
  oracle_state: OracleState | null;
  oracle_updated_at: string | null;
  spread_pct: unknown;
  executable_spread_1k_pct: unknown;
  liquidity_confidence: "high" | "medium" | "low" | null;
  alert: string | null;
  session: SessionName | null;
  session_source: "overnight_flag" | "calendar" | null;
  underlying_price: unknown;
  current_multiplier: unknown;
  pending_multiplier: unknown;
  is_trading_halt: boolean | null;
  venue_dispersion_pct: unknown;
  deviation_ts: string | null;
  feed_status: string | null;
  pool_count: number | null;
  instrument_id: number;
  tvl_usd: unknown;
  status: string | null;
  chainlink_feed: string | null;
  feed_heartbeat_s: number | null;
  all_day_tradability: string | null;
  oracle_paused: boolean | null;
};

const SUMMARY_SQL = `
SELECT e.id, e.ticker, e.name, e.asset_class, i.address, i.id AS instrument_id,
       i.current_multiplier, i.pending_multiplier,
       c.tier, c.reasons, c.feed_status, c.pool_count,
       d.dex_price, d.oracle_price, d.oracle_age_s, d.spread_pct, d.executable_spread_1k_pct,
       d.session, d.session_source, d.oracle_state, d.liquidity_confidence, d.alert,
       d.underlying_price, d.venue_dispersion_pct, d.ts AS deviation_ts,
       o.oracle_updated_at,
       r.is_trading_halt,
       tvl.tvl_usd,
       i.status, i.chainlink_feed, i.feed_heartbeat_s, i.all_day_tradability, i.oracle_paused
FROM instruments i
JOIN equities e ON e.id = i.equity_id
LEFT JOIN LATERAL (
  SELECT tier, reasons, feed_status, pool_count FROM coverage_status cs
  WHERE cs.instrument_id = i.id ORDER BY ts DESC LIMIT 1
) c ON true
LEFT JOIN LATERAL (
  SELECT * FROM deviations d WHERE d.instrument_id = i.id ORDER BY ts DESC LIMIT 1
) d ON true
LEFT JOIN LATERAL (
  SELECT oracle_updated_at FROM oracle_snapshots o WHERE o.instrument_id = i.id ORDER BY ts DESC LIMIT 1
) o ON true
LEFT JOIN LATERAL (
  SELECT is_trading_halt FROM reference_quotes r WHERE r.instrument_id = i.id ORDER BY ts DESC LIMIT 1
) r ON true
LEFT JOIN LATERAL (
  SELECT COALESCE(SUM(s.tvl_usd), 0) AS tvl_usd
  FROM markets m
  JOIN venues v ON v.id = m.venue_id AND v.lane = 'spot'
  LEFT JOIN LATERAL (
    SELECT tvl_usd FROM market_snapshots s WHERE s.market_id = m.id ORDER BY ts DESC LIMIT 1
  ) s ON true
  WHERE m.instrument_id = i.id
) tvl ON true
WHERE i.delisted_at IS NULL
`;

function mapSummary(row: SummaryRow, adapterDown: boolean): EquitySummary {
  const now = new Date();
  const session = row.session ?? "closed";
  const halt = Boolean(row.is_trading_halt);
  const oraclePrice = num(row.oracle_price);
  const oracleAgeS = oracleAgeSeconds(row.oracle_updated_at, now);
  const overnight = row.all_day_tradability === "TRADING_STATUS_TRADABLE";
  const sessionNow = resolveSession(now, overnight);
  const readable = oraclePrice != null && row.oracle_updated_at != null;
  const freshOracle = oracleState({
    ageS: oracleAgeS,
    heartbeatS: row.feed_heartbeat_s,
    session: sessionNow.session,
    overnightTradable: overnight,
    corporateAction: Boolean(row.oracle_paused),
    readable,
  });
  const storedReasons = asTextArray(row.reasons);
  const hadAdapterReason = storedReasons.some((reason) => reason.startsWith("ADAPTER_DOWN:"));
  const classified = classifyTier({
    inactive: row.status === "ASSET_STATUS_INACTIVE",
    verified: !storedReasons.includes("SYMBOL_MISMATCH"),
    hasFeed: Boolean(row.chainlink_feed),
    feedReadable: readable && freshOracle !== "unread",
    oracle: freshOracle,
    eligibleSpot: row.pool_count ?? 0,
    adapterDown: adapterDown || hadAdapterReason,
    decimalsMismatch: storedReasons.includes("DECIMALS_MISMATCH"),
    multiplierMissing: storedReasons.includes("MULTIPLIER_MISSING"),
    halt,
    poolsExistBelowMin: storedReasons.includes("POOL_TVL_BELOW_MIN"),
    poolCount: row.pool_count ?? 0,
  });
  let tier = classified.tier;
  const reasons = [...classified.reasons];
  for (const code of ["SYMBOL_MISMATCH", "MULTIPLIER_MISMATCH"]) {
    if (storedReasons.includes(code) && !reasons.includes(code)) reasons.push(code);
  }
  if ((reasons.includes("SYMBOL_MISMATCH") || reasons.includes("MULTIPLIER_MISMATCH")) && tier !== "LISTED_ONLY") {
    tier = "DEGRADED";
  }
  const notes = adapterDown || hadAdapterReason ? [ADAPTER_DOWN_NOTE] : [];
  return {
    id: row.id,
    ticker: row.ticker,
    name: row.name,
    assetClass: row.asset_class,
    address: row.address,
    tier,
    reasons,
    dexPrice: num(row.dex_price),
    oraclePrice,
    oracleAgeS,
    oracleState: freshOracle,
    oracleUpdatedAt: row.oracle_updated_at,
    spreadPct: num(row.spread_pct),
    executableSpread1kPct: num(row.executable_spread_1k_pct),
    liquidityConfidence: row.liquidity_confidence,
    status: statusWord({ tier, halt, alert: row.alert, session, oracle: freshOracle }),
    alert: row.alert,
    session,
    sessionSource: row.session_source ?? "calendar",
    underlyingPrice: num(row.underlying_price),
    multiplier: num(row.current_multiplier),
    pendingMultiplier: num(row.pending_multiplier),
    halt,
    dispersionPct: num(row.venue_dispersion_pct),
    asOf: row.deviation_ts,
    feedStatus: classified.feedStatus,
    poolCount: row.pool_count ?? 0,
    tvlUsd: num(row.tvl_usd),
    notes,
  };
}

export async function listEquities(filters: {
  tier?: string;
  assetClass?: string;
  hasAlert?: boolean;
  q?: string;
}): Promise<EquitySummary[]> {
  await getDb();
  const tick = await readTickMeta();
  const rows = await q<SummaryRow>(`${SUMMARY_SQL} ORDER BY tvl.tvl_usd DESC NULLS LAST, e.ticker`);
  return rows.map((row) => mapSummary(row, tick.uniswapDown)).filter((row) => {
    if (filters.tier && row.tier !== filters.tier) return false;
    if (filters.assetClass && row.assetClass !== filters.assetClass) return false;
    if (filters.hasAlert && !row.alert) return false;
    if (filters.q) {
      const needle = filters.q.trim().toLowerCase();
      const hay = `${row.ticker} ${row.name} ${row.id} ${row.address}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
}

export async function getEquity(idOrTicker: string): Promise<EquitySummary | null> {
  const key = decodeURIComponent(idOrTicker).toUpperCase();
  const rows = await listEquities({});
  return rows.find((row) => row.id.toUpperCase() === key || row.ticker === key || row.address.toLowerCase() === key.toLowerCase()) ?? null;
}

type TickMeta = {
  at: string | null;
  ageS: number | null;
  uniswapDown: boolean;
  tickMs: number | null;
  errors: string[];
  counts: Record<string, number>;
  stalled: boolean;
};

async function readTickMeta(): Promise<TickMeta> {
  const tick = await q<{ value: { at?: string; counts?: Record<string, number>; errors?: string[]; tickMs?: number; uniswapDown?: boolean }; updated_at: string }>(
    `SELECT value, updated_at::text FROM meta WHERE key = 'last_tick'`,
  );
  const at = tick[0]?.value?.at ?? null;
  const ageS = oracleAgeSeconds(at);
  return {
    at,
    ageS,
    uniswapDown: Boolean(tick[0]?.value?.uniswapDown),
    tickMs: tick[0]?.value?.tickMs ?? null,
    errors: tick[0]?.value?.errors ?? [],
    counts: tick[0]?.value?.counts ?? {},
    stalled: collectorIsStalled(ageS),
  };
}

export async function envelope(extra: Record<string, unknown> = {}) {
  const tick = await readTickMeta();
  return {
    as_of: new Date().toISOString(),
    ages: { collector_s: tick.ageS },
    disclaimer: DISCLAIMER,
    market: nyseStrip(new Date()),
    stalled: tick.stalled,
    stallMessage: tick.stalled ? collectorStallCopy(tick.at) : null,
    collector: tick.at
      ? { at: tick.at, tickMs: tick.tickMs, errors: tick.errors, counts: tick.counts, uniswapDown: tick.uniswapDown }
      : null,
    ...extra,
  };
}

export type MarketView = {
  venueId: string;
  lane: "spot" | "reference" | "derivatives";
  kind: string;
  readPath: string | null;
  quoteSymbol: string | null;
  poolAddress: string | null;
  feeBps: number | null;
  deeplink: string | null;
  priceUsd: number | null;
  tvlUsd: number | null;
  depthUsd: number | null;
  impact1k: number | null;
  impact10k: number | null;
  impact50k: number | null;
  asOf: string | null;
};

export async function marketsFor(instrumentId: number): Promise<MarketView[]> {
  const rows = await q<{
    venue_id: string;
    lane: "spot" | "reference" | "derivatives";
    kind: string;
    read_path: string | null;
    quote_symbol: string | null;
    pool_address: string | null;
    fee_bps: number | null;
    deeplink_url: string | null;
    price_usd_per_token: unknown;
    tvl_usd: unknown;
    depth_1pct_usd: unknown;
    impact_1k_bps: unknown;
    impact_10k_bps: unknown;
    impact_50k_bps: unknown;
    snap_ts: string | null;
  }>(
    `SELECT m.venue_id, v.lane, v.kind, v.read_path, m.quote_symbol, m.pool_address, m.fee_bps, m.deeplink_url,
            s.price_usd_per_token, s.tvl_usd, s.depth_1pct_usd, s.impact_1k_bps, s.impact_10k_bps, s.impact_50k_bps,
            s.ts AS snap_ts
     FROM markets m
     JOIN venues v ON v.id = m.venue_id
     LEFT JOIN LATERAL (
       SELECT * FROM market_snapshots s WHERE s.market_id = m.id ORDER BY ts DESC LIMIT 1
     ) s ON true
     WHERE m.instrument_id = $1
     ORDER BY v.lane, s.tvl_usd DESC NULLS LAST`,
    [instrumentId],
  );
  return rows.map((row) => ({
    venueId: row.venue_id,
    lane: row.lane,
    kind: row.kind,
    readPath: row.read_path,
    quoteSymbol: row.quote_symbol,
    poolAddress: row.pool_address || null,
    feeBps: row.fee_bps,
    deeplink: row.deeplink_url,
    priceUsd: num(row.price_usd_per_token),
    tvlUsd: num(row.tvl_usd),
    depthUsd: num(row.depth_1pct_usd),
    impact1k: num(row.impact_1k_bps),
    impact10k: num(row.impact_10k_bps),
    impact50k: num(row.impact_50k_bps),
    asOf: row.snap_ts,
  }));
}

export async function instrumentIdFor(equityId: string): Promise<number | null> {
  const rows = await q<{ id: number }>(`SELECT i.id FROM instruments i WHERE i.equity_id = $1 AND i.delisted_at IS NULL`, [equityId]);
  return rows[0]?.id ?? null;
}

export async function deviationSeries(instrumentId: number, range: "1d" | "7d" | "30d") {
  const hours = range === "30d" ? 24 * 30 : range === "7d" ? 24 * 7 : 24;
  const rows = await q<{ ts: string; dex_price: unknown; oracle_price: unknown; spread_pct: unknown; session: string }>(
    `SELECT ts::text, dex_price, oracle_price, spread_pct, session
     FROM deviations
     WHERE instrument_id = $1 AND ts > now() - ($2 || ' hours')::interval
     ORDER BY ts`,
    [instrumentId, String(hours)],
  );
  return rows.map((row) => ({
    ts: row.ts,
    dexPrice: num(row.dex_price),
    oraclePrice: num(row.oracle_price),
    spreadPct: num(row.spread_pct),
    session: row.session,
  }));
}

export async function coverageCounts() {
  const rows = await listEquities({});
  const counts = { listed: rows.length, FULL: 0, ORACLE_ONLY: 0, DEX_ONLY: 0, LISTED_ONLY: 0, DEGRADED: 0 };
  for (const row of rows) counts[row.tier] += 1;
  const tracked = rows.reduce((sum, row) => sum + (row.tvlUsd ?? 0), 0);
  const alerts = rows.filter((row) => row.alert).length;
  const spreads = rows.map((row) => row.spreadPct).filter((n): n is number => n != null);
  const largest = spreads.sort((a, b) => Math.abs(b) - Math.abs(a))[0] ?? null;
  return { counts, tracked, alerts, largestSpread: largest, rows };
}

export async function verifyAddress(address: string) {
  const rows = await q<{ id: string; ticker: string; name: string; address: string }>(
    `SELECT e.id, e.ticker, e.name, i.address
     FROM instruments i JOIN equities e ON e.id = i.equity_id
     WHERE lower(i.address) = lower($1) AND i.delisted_at IS NULL`,
    [address],
  );
  if (!rows[0]) return { verified: false as const };
  return { verified: true as const, equity: rows[0] };
}

export async function openIssues() {
  return q<{ symbol: string; code: string; detail: string | null; first_seen: string }>(
    `SELECT i.symbol, c.code, c.detail, c.first_seen::text
     FROM coverage_issues c JOIN instruments i ON i.id = c.instrument_id
     WHERE c.resolved_at IS NULL
     ORDER BY i.symbol, c.code`,
  );
}

export async function referenceFor(instrumentId: number) {
  const rows = await q<{ bid: unknown; ask: unknown; generated_at: string | null; oracle_vs_reference_pct: unknown; is_trading_halt: boolean | null }>(
    `SELECT bid, ask, generated_at::text, oracle_vs_reference_pct, is_trading_halt
     FROM reference_quotes WHERE instrument_id = $1 ORDER BY ts DESC LIMIT 1`,
    [instrumentId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    bid: num(row.bid),
    ask: num(row.ask),
    generatedAt: row.generated_at,
    oracleVsReferencePct: num(row.oracle_vs_reference_pct),
    halt: Boolean(row.is_trading_halt),
  };
}

export async function actionsFor(instrumentId: number) {
  return q<{ type: string | null; status: string | null; process_date: string | null }>(
    `SELECT type, status, process_date::text FROM corporate_actions WHERE instrument_id = $1 ORDER BY process_date DESC NULLS LAST`,
    [instrumentId],
  );
}

export async function alertFor(instrumentId: number) {
  const rows = await q<{ kind: string; started_at: string; last_seen_at: string; peak_spread_pct: unknown }>(
    `SELECT kind, started_at::text, last_seen_at::text, peak_spread_pct
     FROM alerts WHERE instrument_id = $1 AND resolved_at IS NULL ORDER BY started_at DESC LIMIT 1`,
    [instrumentId],
  );
  const row = rows[0];
  if (!row) return null;
  return { kind: row.kind, startedAt: row.started_at, lastSeenAt: row.last_seen_at, peak: num(row.peak_spread_pct) };
}
