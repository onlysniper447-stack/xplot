/**
 * Number engines. DEX and Chainlink prices passed here are already USD per token.
 * The multiplier is applied only in tokenEquivalent / underlyingFromToken.
 */

export type OracleState = "live" | "frozen_at_close" | "frozen_corporate_action" | "stale" | "unread";

export type Tier = "FULL" | "ORACLE_ONLY" | "DEX_ONLY" | "LISTED_ONLY" | "DEGRADED";

export type Lane = "spot" | "reference" | "derivatives";

export type SessionName = "open" | "pre" | "post" | "overnight" | "closed";

export function tokenEquivalent(rawUnderlying: number, sharesPerToken: number): number {
  return rawUnderlying * sharesPerToken;
}

export function underlyingFromToken(tokenPrice: number, sharesPerToken: number): number {
  if (!Number.isFinite(sharesPerToken) || sharesPerToken === 0) return Number.NaN;
  return tokenPrice / sharesPerToken;
}

/** Per token versus per token. Does not take a multiplier. */
export function spreadPct(dexPerToken: number, chainlinkPerToken: number): number {
  return ((dexPerToken - chainlinkPerToken) / chainlinkPerToken) * 100;
}

export function executableSpreadPct(dexPerToken: number, chainlinkPerToken: number, impactBps: number): number {
  const executed = dexPerToken * (1 + impactBps / 10_000);
  return spreadPct(executed, chainlinkPerToken);
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** k = 1. Fallbacks when a 20-day sigma is not available: 2% off-market, 0.75% while open. */
export function alertThresholdPct(sigmaDailyPct: number | null, session: SessionName): number {
  if (sigmaDailyPct == null || !Number.isFinite(sigmaDailyPct)) {
    return session === "open" ? 0.75 : 2;
  }
  return clamp(sigmaDailyPct, 0.5, 3);
}

export function liquidityConfidence(depth1pctUsd: number | null): "high" | "medium" | "low" | null {
  if (depth1pctUsd == null || !Number.isFinite(depth1pctUsd)) return null;
  if (depth1pctUsd >= 250_000) return "high";
  if (depth1pctUsd >= 25_000) return "medium";
  return "low";
}

export function constantProductImpactBps(amountIn: number, reserveIn: number, feeBps: number): number | null {
  if (!(amountIn > 0) || !(reserveIn > 0)) return null;
  return (amountIn / (reserveIn + amountIn)) * 10_000 + feeBps;
}

export type SpotPrint = {
  lane: Lane;
  priceUsdPerToken: number | null;
  tvlUsd: number | null;
  depth1pctUsd: number | null;
  updatedWithinWindow: boolean;
};

export type SpotAggregate = {
  primary: number | null;
  min: number | null;
  max: number | null;
  dispersionPct: number | null;
  tvlUsd: number;
  eligibleCount: number;
  depth1pctUsd: number | null;
};

const MIN_TVL = 1000;

/** Spot lane only. Reference and derivatives never move the price or the TVL. */
export function aggregateSpot(markets: SpotPrint[]): SpotAggregate {
  const eligible = markets.filter(
    (m) =>
      m.lane === "spot" &&
      m.priceUsdPerToken != null &&
      Number.isFinite(m.priceUsdPerToken) &&
      m.priceUsdPerToken > 0 &&
      (m.tvlUsd ?? 0) >= MIN_TVL &&
      m.updatedWithinWindow,
  );
  const tvlUsd = markets
    .filter((m) => m.lane === "spot")
    .reduce((sum, m) => sum + (m.tvlUsd != null && m.tvlUsd > 0 ? m.tvlUsd : 0), 0);

  if (eligible.length === 0) {
    return { primary: null, min: null, max: null, dispersionPct: null, tvlUsd, eligibleCount: 0, depth1pctUsd: null };
  }
  const ranked = [...eligible].sort((a, b) => {
    const da = a.depth1pctUsd ?? -1;
    const db = b.depth1pctUsd ?? -1;
    if (db !== da) return db - da;
    return (b.tvlUsd ?? 0) - (a.tvlUsd ?? 0);
  });
  const prices = eligible.map((m) => m.priceUsdPerToken as number);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const primary = ranked[0].priceUsdPerToken as number;
  return {
    primary,
    min,
    max,
    dispersionPct: primary === 0 ? null : ((max - min) / primary) * 100,
    tvlUsd,
    eligibleCount: eligible.length,
    depth1pctUsd: ranked[0].depth1pctUsd,
  };
}

export type RoundRead = {
  answer: bigint;
  updatedAt: bigint;
  roundId: bigint;
  answeredInRound: bigint;
  decimals: number;
};

export function decodeOraclePrice(round: RoundRead): { price: number; updatedAt: Date } | null {
  if (round.answer <= 0n) return null;
  if (round.updatedAt <= 0n) return null;
  if (round.answeredInRound < round.roundId) return null;
  if (!Number.isInteger(round.decimals) || round.decimals < 0 || round.decimals > 30) return null;
  const price = Number(round.answer) / 10 ** round.decimals;
  if (!Number.isFinite(price) || price <= 0) return null;
  return { price, updatedAt: new Date(Number(round.updatedAt) * 1000) };
}

export function oracleState(input: {
  ageS: number | null;
  heartbeatS: number | null;
  session: SessionName;
  overnightTradable: boolean;
  corporateAction: boolean;
  readable: boolean;
}): OracleState {
  if (!input.readable || input.ageS == null) return "unread";
  if (input.corporateAction) return "frozen_corporate_action";
  const closedPrint =
    input.session === "closed" || (!input.overnightTradable && input.session === "post");
  if (closedPrint) return "frozen_at_close";
  const heartbeat = input.heartbeatS != null && input.heartbeatS > 0 ? input.heartbeatS : 86_400;
  if (input.ageS > heartbeat * 1.5) return "stale";
  return "live";
}

export type TierInput = {
  inactive: boolean;
  verified: boolean;
  hasFeed: boolean;
  feedReadable: boolean;
  oracle: OracleState;
  eligibleSpot: number;
  /** The pool scan did not finish. Suppresses NO_POOL. Never changes the tier. */
  adapterDown: boolean;
  decimalsMismatch: boolean;
  multiplierMissing: boolean;
  halt: boolean;
  poolsExistBelowMin: boolean;
  /** Pools discovered, including ones that could not be priced. Defaults to the eligible count. */
  poolCount?: number;
};

export const ADAPTER_DOWN_NOTE = "Uniswap adapter down. DEX prices unavailable.";
export const COLLECTOR_STALL_AFTER_S = 180;

/** Age of an oracle print at read time. `updatedAt` is the feed timestamp, not the collector clock. */
export function oracleAgeSeconds(updatedAt: Date | string | null, now: Date = new Date()): number | null {
  if (updatedAt == null) return null;
  const ms = updatedAt instanceof Date ? updatedAt.getTime() : Date.parse(updatedAt);
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.round((now.getTime() - ms) / 1000));
}

export function collectorIsStalled(ageS: number | null): boolean {
  return ageS != null && ageS > COLLECTOR_STALL_AFTER_S;
}

export function collectorStallCopy(at: string | null): string {
  let time = "an unknown time";
  if (at) {
    const ms = Date.parse(at);
    time = Number.isFinite(ms) ? `${new Date(ms).toISOString().replace("T", " ").slice(0, 16)} UTC` : at;
  }
  return `Collector stalled. Showing last known values from ${time}.`;
}

export function classifyTier(input: TierInput): { tier: Tier; reasons: string[]; feedStatus: string } {
  const reasons: string[] = [];
  if (input.inactive) reasons.push("INACTIVE");
  if (!input.hasFeed) reasons.push("NO_FEED");
  if (input.hasFeed && !input.feedReadable) reasons.push("FEED_STALE");
  if (input.oracle === "stale") reasons.push("FEED_STALE");
  if (input.multiplierMissing) reasons.push("MULTIPLIER_MISSING");
  if (input.decimalsMismatch) reasons.push("DECIMALS_MISMATCH");
  if (input.halt) reasons.push("TRADING_HALT");
  const poolsFound = input.poolCount ?? input.eligibleSpot;
  if (!input.adapterDown && input.hasFeed && input.eligibleSpot === 0 && !input.poolsExistBelowMin && poolsFound === 0) {
    reasons.push("NO_POOL");
  }
  if (!input.adapterDown && input.eligibleSpot === 0 && input.poolsExistBelowMin) {
    reasons.push("POOL_TVL_BELOW_MIN");
  }

  const fresh =
    input.feedReadable &&
    (input.oracle === "live" || input.oracle === "frozen_at_close" || input.oracle === "frozen_corporate_action");
  const ownFeedBroken = (input.hasFeed && !input.feedReadable) || input.oracle === "stale";
  let tier: Tier;
  if (input.inactive) tier = "LISTED_ONLY";
  else if (!input.verified) tier = "DEGRADED";
  else if (ownFeedBroken) tier = "DEGRADED";
  else if (fresh && input.eligibleSpot >= 1) tier = "FULL";
  else if (fresh && input.eligibleSpot === 0) tier = "ORACLE_ONLY";
  else if (!input.hasFeed && input.eligibleSpot >= 1) tier = "DEX_ONLY";
  else if (!input.hasFeed && input.eligibleSpot === 0) tier = "LISTED_ONLY";
  else tier = "DEGRADED";

  if (input.decimalsMismatch && tier !== "LISTED_ONLY") tier = "DEGRADED";

  const feedStatus = !input.hasFeed ? "missing" : !input.feedReadable || input.oracle === "stale" ? "stale" : "ok";
  return { tier, reasons: [...new Set(reasons)], feedStatus };
}

export type AlertKind = "OFF_MARKET_LOW_LIQUIDITY" | "DISLOCATION" | "TRADING_HALT" | "ORACLE_STALE" | "ORACLE_REFERENCE_MISMATCH" | "MULTIPLIER_MISMATCH";

export function dislocationKind(session: SessionName): "OFF_MARKET_LOW_LIQUIDITY" | "DISLOCATION" | null {
  if (session === "open") return "DISLOCATION";
  return "OFF_MARKET_LOW_LIQUIDITY";
}

/**
 * A spread alert needs 3 consecutive ticks over the threshold.
 * Halts suppress dislocation. Thin pools do not loosen the threshold.
 */
export function persistSpreadAlert(input: {
  spreads: Array<number | null>;
  session: SessionName;
  oracle: OracleState;
  thresholdPct: number;
  halt: boolean;
  alertsPaused: boolean;
}): "OFF_MARKET_LOW_LIQUIDITY" | "DISLOCATION" | null {
  if (input.halt || input.alertsPaused) return null;
  if (input.oracle !== "live" && input.oracle !== "frozen_at_close") return null;
  if (input.session === "open" && input.oracle !== "live") return null;
  const last = input.spreads.slice(-3);
  if (last.length < 3) return null;
  const hot = last.every((s) => s != null && Math.abs(s) > input.thresholdPct);
  if (!hot) return null;
  return dislocationKind(input.session);
}

export function alertCopy(kind: string, spreadPctValue: number | null, confidence: string | null): string {
  const x = spreadPctValue == null ? "—" : `${spreadPctValue > 0 ? "+" : ""}${spreadPctValue.toFixed(2)}`;
  const thin = confidence === "low" ? " Thin liquidity, price may not be reliable." : "";
  if (kind === "OFF_MARKET_LOW_LIQUIDITY") {
    return `Off-market price discovery: DEX is ${x}% from last close. Liquidity is thin.${thin}`;
  }
  if (kind === "DISLOCATION") {
    return `DEX and oracle disagree by ${x}% while markets are open.${thin}`;
  }
  if (kind === "TRADING_HALT") return "The reference reports a trading halt. Dislocation alerts are suppressed.";
  if (kind === "ORACLE_STALE") return "The oracle update is late for an open session.";
  if (kind === "ORACLE_REFERENCE_MISMATCH") return "Chainlink and the Robinhood reference differ by more than 1% during regular hours.";
  if (kind === "MULTIPLIER_MISMATCH") return "The on-chain multiplier does not match the asset registry.";
  return "An alert is open on this equity.";
}

export function scorecard(input: { dexPreOpen: number; lastClose: number; openPrice: number }): {
  gapPredictedPct: number;
  gapActualPct: number;
  errorPct: number;
} {
  const gapPredictedPct = ((input.dexPreOpen - input.lastClose) / input.lastClose) * 100;
  const gapActualPct = ((input.openPrice - input.lastClose) / input.lastClose) * 100;
  return { gapPredictedPct, gapActualPct, errorPct: Math.abs(gapPredictedPct - gapActualPct) };
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
  return sorted[mid];
}

/** In-range lower bound for a 1% quote move. Adjacent ticks are not included. */
export function inRangeDepthUsd(input: {
  liquidity: bigint;
  sqrtPriceX96: bigint;
  token0IsQuote: boolean;
  quoteUsd: number;
  quoteDecimals: number;
  tokenDecimals: number;
}): number | null {
  if (input.liquidity <= 0n || input.sqrtPriceX96 <= 0n) return null;
  const Q96 = 2 ** 96;
  const sqrtP = Number(input.sqrtPriceX96) / Q96;
  if (!Number.isFinite(sqrtP) || sqrtP <= 0) return null;
  const L = Number(input.liquidity);
  const sqrtUp = sqrtP * Math.sqrt(1.01);
  const sqrtDown = sqrtP / Math.sqrt(1.01);
  let quoteAmount: number;
  if (input.token0IsQuote) {
    quoteAmount = L * (1 / sqrtDown - 1 / sqrtP);
    quoteAmount = quoteAmount / 10 ** input.quoteDecimals;
  } else {
    quoteAmount = L * (sqrtUp - sqrtP);
    quoteAmount = quoteAmount / 10 ** input.quoteDecimals;
  }
  if (!Number.isFinite(quoteAmount) || quoteAmount < 0) return null;
  return quoteAmount * input.quoteUsd;
}

/** Human units of token1 per one human unit of token0. */
export function priceOfToken0InToken1(sqrtPriceX96: bigint, decimals0: number, decimals1: number): number | null {
  if (sqrtPriceX96 <= 0n) return null;
  const Q96 = 2 ** 96;
  const sqrtP = Number(sqrtPriceX96) / Q96;
  const raw = sqrtP * sqrtP;
  const scaled = raw * 10 ** (decimals0 - decimals1);
  if (!Number.isFinite(scaled) || scaled <= 0) return null;
  return scaled;
}

export function statusWord(input: {
  tier: Tier;
  halt: boolean;
  alert: string | null;
  session: SessionName;
  oracle: OracleState;
}): "Aligned" | "Off-market" | "Dislocated" | "Delayed" | "Halted" | "No live data" {
  if (input.halt) return "Halted";
  if (input.tier === "LISTED_ONLY") return "No live data";
  if (input.oracle === "stale" || input.oracle === "unread" || input.tier === "DEGRADED") return "Delayed";
  if (input.alert === "DISLOCATION") return "Dislocated";
  if (input.session !== "open") return "Off-market";
  return "Aligned";
}

export function nearlyEqual(a: number, b: number, rel = 1e-8): boolean {
  const scale = Math.max(Math.abs(a), Math.abs(b), 1);
  return Math.abs(a - b) <= scale * rel;
}
