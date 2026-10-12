import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readValue, rpcReadFailure } from "../collector/rpc-read";
import {
  aggregateSpot,
  alertThresholdPct,
  classifyTier,
  collectorIsStalled,
  collectorStallCopy,
  constantProductImpactBps,
  decodeOraclePrice,
  deriveStatus,
  oracleAgeSeconds,
  oracleFreshnessLabel,
  executableSpreadPct,
  liquidityConfidence,
  oracleState,
  persistSpreadAlert,
  scorecard,
  spreadPct,
  tokenEquivalent,
  underlyingFromToken,
  updatedWithinPoolWindow,
} from "./engines";
import { HOLIDAYS, EARLY_CLOSE, resolveSession } from "./session";

describe("multiplier", () => {
  it("converts raw and token prices once, and compares per token", () => {
    const raw = 69.45;
    const multiplier = 4;
    const chainlink = tokenEquivalent(raw, multiplier);
    const dex = 278;
    assert.equal(chainlink, 277.8);
    assert.ok(Math.abs(underlyingFromToken(chainlink, multiplier) - raw) < 1e-9);
    const honest = spreadPct(dex, chainlink);
    const doubleOnDexOnly = spreadPct(dex * multiplier, chainlink);
    assert.ok(Math.abs(honest - ((278 - 277.8) / 277.8) * 100) < 1e-9);
    assert.ok(Math.abs(doubleOnDexOnly) > Math.abs(honest) * 10);
  });
});

describe("lanes", () => {
  it("ignores reference and derivative prints", () => {
    const agg = aggregateSpot([
      { lane: "spot", priceUsdPerToken: 10, tvlUsd: 50_000, depth1pctUsd: 20_000, updatedWithinWindow: true },
      { lane: "reference", priceUsdPerToken: 99, tvlUsd: 5_000_000, depth1pctUsd: 5_000_000, updatedWithinWindow: true },
      { lane: "derivatives", priceUsdPerToken: 1, tvlUsd: 9_000_000, depth1pctUsd: 9_000_000, updatedWithinWindow: true },
      { lane: "spot", priceUsdPerToken: 11, tvlUsd: 500, depth1pctUsd: 100, updatedWithinWindow: true },
    ]);
    assert.equal(agg.primary, 10);
    assert.equal(agg.tvlUsd, 50_500);
    assert.equal(agg.eligibleCount, 1);
  });
});

describe("oracle", () => {
  it("rejects a non-positive answer", () => {
    assert.equal(
      decodeOraclePrice({ answer: 0n, updatedAt: 10n, roundId: 1n, answeredInRound: 1n, decimals: 8 }),
      null,
    );
  });

  it("holds last close when the session is closed", () => {
    assert.equal(
      oracleState({ ageS: 100, heartbeatS: 86_400, session: "closed", overnightTradable: true, corporateAction: false, readable: true }),
      "frozen_at_close",
    );
  });

  it("is stale only when the session is open and the age exceeds 1.5 heartbeats", () => {
    assert.equal(
      oracleState({ ageS: 90_000, heartbeatS: 86_400, session: "open", overnightTradable: true, corporateAction: false, readable: true }),
      "live",
    );
    assert.equal(
      oracleState({ ageS: 200_000, heartbeatS: 86_400, session: "open", overnightTradable: true, corporateAction: false, readable: true }),
      "stale",
    );
  });
});

describe("tiers", () => {
  const base = {
    inactive: false,
    verified: true,
    hasFeed: true,
    feedReadable: true,
    oracle: "live" as const,
    eligibleSpot: 1,
    adapterDown: false,
    decimalsMismatch: false,
    multiplierMissing: false,
    halt: false,
    poolsExistBelowMin: false,
  };
  it("covers all five tiers", () => {
    assert.equal(classifyTier(base).tier, "FULL");
    assert.equal(classifyTier({ ...base, eligibleSpot: 0 }).tier, "ORACLE_ONLY");
    assert.equal(classifyTier({ ...base, hasFeed: false, feedReadable: false, oracle: "unread" }).tier, "DEX_ONLY");
    assert.equal(classifyTier({ ...base, hasFeed: false, feedReadable: false, oracle: "unread", eligibleSpot: 0 }).tier, "LISTED_ONLY");
    assert.equal(classifyTier({ ...base, oracle: "stale" }).tier, "DEGRADED");
    assert.equal(classifyTier({ ...base, eligibleSpot: 0 }).reasons.includes("NO_POOL"), true);
    assert.equal(classifyTier({ ...base, eligibleSpot: 0, poolCount: 2 }).reasons.includes("NO_POOL"), false);
    const listed = classifyTier({ ...base, hasFeed: false, feedReadable: false, oracle: "unread", eligibleSpot: 0 });
    assert.equal(listed.tier, "LISTED_ONLY");
    assert.equal(listed.reasons.includes("NO_FEED"), true);
  });
  it("marks affected tokens DEGRADED with DEX_UNAVAILABLE when the adapter is down", () => {
    const down = classifyTier({ ...base, eligibleSpot: 0, adapterDown: true });
    assert.equal(down.tier, "DEGRADED");
    assert.equal(down.reasons.includes("DEX_UNAVAILABLE"), true);
    assert.equal(down.reasons.includes("ADAPTER_DOWN:uniswap"), false);
    assert.equal(down.reasons.includes("NO_POOL"), false);
    const full = classifyTier({ ...base, adapterDown: true });
    assert.equal(full.tier, "DEGRADED");
    assert.equal(full.reasons.includes("DEX_UNAVAILABLE"), true);
    const dexOnly = classifyTier({ ...base, hasFeed: false, feedReadable: false, oracle: "unread", adapterDown: true });
    assert.equal(dexOnly.tier, "DEGRADED");
    assert.equal(dexOnly.reasons.includes("DEX_UNAVAILABLE"), true);
    const noFeed = classifyTier({ ...base, hasFeed: false, feedReadable: false, oracle: "unread", eligibleSpot: 0, adapterDown: true });
    assert.equal(noFeed.tier, "LISTED_ONLY");
    assert.equal(noFeed.reasons.includes("DEX_UNAVAILABLE"), false);
  });
  it("returns a failed result with a reason on RPC timeout", () => {
    const timeout = new Error("The operation was aborted");
    timeout.name = "AbortError";
    const failed = rpcReadFailure(timeout);
    assert.equal(failed.ok, false);
    assert.equal(failed.reason, "RPC timeout");
    assert.equal(readValue(failed), null);
  });
  it("never shows a failed DEX read as live", () => {
    const failed = classifyTier({ ...base, adapterDown: true });
    const status = deriveStatus({ collectorAgeS: 30, adapterDown: true, tier: failed.tier, hasPrint: true });
    assert.equal(failed.tier, "DEGRADED");
    assert.equal(status, "degraded");
    assert.notEqual(status, "live");
  });
  it("labels a stalled collector stale instead of live", () => {
    const at = "2026-10-12T16:25:00Z";
    const status = deriveStatus({ collectorAgeS: 181, adapterDown: true, tier: "DEGRADED", hasPrint: true });
    assert.equal(status, "stale");
    const label = oracleFreshnessLabel({ dataStatus: status, oracleState: "live", collectorAt: at });
    assert.equal(label, "stale · last 2026-10-12 16:25 UTC");
    assert.equal(label.includes("live"), false);
    assert.equal(deriveStatus({ collectorAgeS: 180, adapterDown: false, tier: "ORACLE_ONLY", hasPrint: true }), "live");
  });
  it("uses the no-liquidity reason when the collector is fresh and the adapter is up", () => {
    const fresh = classifyTier({ ...base, eligibleSpot: 0, adapterDown: false });
    assert.equal(fresh.tier, "ORACLE_ONLY");
    assert.equal(fresh.reasons.includes("NO_POOL"), true);
    assert.equal(fresh.reasons.includes("DEX_UNAVAILABLE"), false);
    assert.equal(deriveStatus({ collectorAgeS: 30, adapterDown: false, tier: fresh.tier, hasPrint: true }), "live");
  });
  it("keeps a pool inside the five-minute window and drops an older one", () => {
    const now = new Date("2026-10-12T16:30:00.000Z");
    assert.equal(updatedWithinPoolWindow("2026-10-12T16:25:00.000Z", now), true);
    assert.equal(updatedWithinPoolWindow("2026-10-12T16:24:59.999Z", now), false);
    assert.equal(updatedWithinPoolWindow(null, now), true);
    const agg = aggregateSpot([
      {
        lane: "spot",
        priceUsdPerToken: 10,
        tvlUsd: 50_000,
        depth1pctUsd: 20_000,
        updatedWithinWindow: updatedWithinPoolWindow("2026-10-12T16:26:00.000Z", now),
      },
      {
        lane: "spot",
        priceUsdPerToken: 12,
        tvlUsd: 80_000,
        depth1pctUsd: 40_000,
        updatedWithinWindow: updatedWithinPoolWindow("2026-10-12T16:20:00.000Z", now),
      },
    ]);
    assert.equal(agg.eligibleCount, 1);
    assert.equal(agg.primary, 10);
  });
  it("ages an oracle from its updatedAt and flags a stalled collector after 3 minutes", () => {
    const now = new Date("2026-10-12T15:00:00Z");
    assert.equal(oracleAgeSeconds("2026-10-12T14:00:00Z", now), 3600);
    assert.equal(collectorIsStalled(180), false);
    assert.equal(collectorIsStalled(181), true);
    assert.equal(
      collectorStallCopy("2026-10-12T14:57:00Z"),
      "Collector stalled. Showing last known values from 2026-10-12 14:57 UTC.",
    );
  });
  it("treats a frozen close as fresh", () => {
    assert.equal(classifyTier({ ...base, oracle: "frozen_at_close" }).tier, "FULL");
  });
});

describe("alerts", () => {
  it("waits for three ticks and does not loosen for thin liquidity", () => {
    const threshold = alertThresholdPct(null, "closed");
    assert.equal(threshold, 2);
    assert.equal(liquidityConfidence(1000), "low");
    const common = { session: "closed" as const, oracle: "frozen_at_close" as const, thresholdPct: threshold, halt: false, alertsPaused: false };
    assert.equal(persistSpreadAlert({ ...common, spreads: [3, 3] }), null);
    assert.equal(persistSpreadAlert({ ...common, spreads: [3, 3, 3] }), "OFF_MARKET_LOW_LIQUIDITY");
    assert.equal(persistSpreadAlert({ ...common, spreads: [3, 3, 3], halt: true }), null);
    assert.equal(
      persistSpreadAlert({ ...common, session: "open", oracle: "live", thresholdPct: 0.75, spreads: [1, 1, 1] }),
      "DISLOCATION",
    );
  });
});

describe("scorecard and impact", () => {
  it("measures the open error", () => {
    const row = scorecard({ dexPreOpen: 110, lastClose: 100, openPrice: 104 });
    assert.equal(row.gapPredictedPct, 10);
    assert.equal(row.gapActualPct, 4);
    assert.equal(row.errorPct, 6);
  });
  it("adds the fee to constant-product impact", () => {
    const bps = constantProductImpactBps(1000, 100_000, 30);
    assert.ok(bps != null && Math.abs(bps - (1000 / 101_000) * 10_000 - 30) < 1e-9);
  });
  it("moves the executable spread by the quoted impact", () => {
    const base = spreadPct(100, 100);
    assert.equal(base, 0);
    const after = executableSpreadPct(100, 100, 50);
    assert.ok(Math.abs(after - 0.5) < 1e-9);
  });
});

describe("session", () => {
  it("keeps the holiday and early-close sets populated", () => {
    assert.ok(HOLIDAYS.size >= 16);
    assert.ok(EARLY_CLOSE.size >= 2);
  });
  it("handles a weekend, a holiday, an early close, and the 24/5 overnight flag", () => {
    const saturday = resolveSession(new Date("2026-10-10T19:00:00Z"), true);
    assert.equal(saturday.session, "closed");
    assert.equal(saturday.source, "overnight_flag");

    const pre = resolveSession(new Date("2026-10-12T11:58:00Z"), true);
    assert.equal(pre.session, "pre");

    const regular = resolveSession(new Date("2026-10-12T14:00:00Z"), true);
    assert.equal(regular.session, "open");

    const thanksgiving = resolveSession(new Date("2026-11-26T16:00:00Z"), true);
    assert.equal(thanksgiving.session, "closed");

    const earlyOpen = resolveSession(new Date("2026-11-27T17:30:00Z"), false);
    assert.equal(earlyOpen.session, "open");
    assert.equal(earlyOpen.source, "calendar");

    const earlyAfter = resolveSession(new Date("2026-11-27T19:00:00Z"), false);
    assert.equal(earlyAfter.session, "post");

    const sundayNight = resolveSession(new Date("2026-10-12T01:00:00Z"), true);
    assert.equal(sundayNight.session, "overnight");

    const sundayNightCalendar = resolveSession(new Date("2026-10-12T01:00:00Z"), false);
    assert.equal(sundayNightCalendar.session, "closed");
  });
});
