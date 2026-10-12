import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  aggregateSpot,
  alertThresholdPct,
  classifyTier,
  constantProductImpactBps,
  decodeOraclePrice,
  executableSpreadPct,
  liquidityConfidence,
  oracleState,
  persistSpreadAlert,
  scorecard,
  spreadPct,
  tokenEquivalent,
  underlyingFromToken,
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
  });
  it("does not call a failed adapter oracle-only", () => {
    assert.equal(classifyTier({ ...base, eligibleSpot: 0, adapterDown: true }).tier, "DEGRADED");
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
