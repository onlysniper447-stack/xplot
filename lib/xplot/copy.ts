import { alertCopy, type OracleState, type SessionName, type Tier } from "./engines";
import { formatPct } from "./format";
import { sessionLabel } from "./session";

function sessionPhrase(session: SessionName): string {
  if (session === "open") return "Market open";
  if (session === "pre") return "Pre-market";
  if (session === "post") return "Post-market";
  if (session === "overnight") return "Overnight";
  return "Market closed";
}

/** One status line for the equity header. The longer verdict stays in the gap popover. */
export function headerVerdict(input: {
  tier: Tier;
  halt: boolean;
  session: SessionName;
  sessionSource: "overnight_flag" | "calendar";
  oracle: OracleState;
  dexPrice: number | null;
}): string {
  const parts = [sessionPhrase(input.session)];
  parts.push(input.sessionSource === "overnight_flag" ? "24/5 reference" : "Calendar session");
  if (input.halt) parts.push("Trading halt");
  if (input.tier === "LISTED_ONLY") parts.push("No live data");
  else if (input.dexPrice == null) parts.push("DEX price unavailable");
  else if (input.tier === "DEX_ONLY") parts.push("No oracle reference");
  if (input.tier !== "LISTED_ONLY" && (input.oracle === "stale" || input.oracle === "unread")) {
    parts.push("Oracle update delayed");
  } else if (input.oracle === "frozen_corporate_action") {
    parts.push("Oracle held for a corporate action");
  } else if (input.oracle === "frozen_at_close" && input.session !== "closed") {
    parts.push("Oracle at last close");
  }
  return parts.join(" · ");
}

export function verdict(input: {
  tier: Tier;
  halt: boolean;
  alert: string | null;
  session: SessionName;
  sessionSource: "overnight_flag" | "calendar";
  oracle: OracleState;
  spreadPct: number | null;
  confidence: "high" | "medium" | "low" | null;
}): string {
  if (input.halt) return "Trading halt reported. Dislocation alerts are suppressed.";
  if (input.tier === "LISTED_ONLY") return "No live data yet.";
  if (input.tier === "DEX_ONLY") return "No oracle reference. Spread unavailable.";
  if (input.tier === "ORACLE_ONLY") return "No active DEX market.";
  if (input.alert === "OFF_MARKET_LOW_LIQUIDITY" || input.alert === "DISLOCATION") {
    return alertCopy(input.alert, input.spreadPct, input.confidence);
  }
  if (input.oracle === "frozen_at_close") {
    const gap = input.spreadPct == null ? "" : ` DEX is ${formatPct(input.spreadPct)} from last close.`;
    const liq = input.confidence ? ` Liquidity: ${input.confidence}.` : "";
    return `Market closed.${gap}${liq}`.trim();
  }
  if (input.oracle === "stale" || input.oracle === "unread") return "Oracle update is delayed.";
  if (input.spreadPct == null) return sessionLabel(input.session, input.sessionSource);
  return `${sessionLabel(input.session, input.sessionSource)} DEX is ${formatPct(input.spreadPct)} from the oracle.`;
}

const REASON_PLAIN: Record<string, string> = {
  NO_FEED: "No Chainlink feed is listed for this token.",
  FEED_STALE: "The oracle print is stale.",
  NO_POOL: "No spot pool was found.",
  POOL_TVL_BELOW_MIN: "Pool liquidity is under the minimum.",
  INACTIVE: "This token is inactive.",
  TRADING_HALT: "A trading halt is reported.",
  DECIMALS_MISMATCH: "Token decimals do not match the registry.",
  MULTIPLIER_MISSING: "The multiplier is missing.",
  MULTIPLIER_MISMATCH: "The multiplier does not match the registry.",
  SYMBOL_MISMATCH: "The symbol does not match the registry.",
};

export function reasonPlain(code: string): string {
  return REASON_PLAIN[code] ?? "A coverage check failed.";
}

/** Slim notice for a real token problem. A venue-wide adapter outage stays on the shell banner. */
export function qualityNotice(input: {
  tier: Tier;
  halt: boolean;
  oracle: OracleState;
  dexPrice: number | null;
  oraclePrice: number | null;
  reasons: string[];
  adapterDown: boolean;
}): string | null {
  const brokenRegistry = input.reasons.some((code) =>
    code === "SYMBOL_MISMATCH" || code === "DECIMALS_MISMATCH" || code === "MULTIPLIER_MISMATCH" || code === "MULTIPLIER_MISSING",
  );
  if (input.halt || input.reasons.includes("TRADING_HALT")) {
    return "A trading halt is reported. Dislocation alerts are suppressed.";
  }
  if (brokenRegistry) return "This token's registry data does not match the on-chain instrument.";
  if ((input.oracle === "stale" || input.oracle === "unread") && input.tier !== "LISTED_ONLY" && input.tier !== "DEX_ONLY") {
    return "The oracle update is delayed.";
  }
  if (input.reasons.includes("INACTIVE")) return "This token is inactive.";
  if (input.tier === "LISTED_ONLY") return "No live price is available for this token.";
  if (input.adapterDown && input.oraclePrice != null) return "DEX prices are temporarily unavailable. Showing oracle price.";
  if (input.adapterDown) return "DEX prices are temporarily unavailable.";
  if (input.dexPrice == null && input.oraclePrice != null) return "No DEX market is available. Showing the oracle price.";
  if (input.tier === "DEX_ONLY") return "No oracle reference. Spread is unavailable.";
  if (input.reasons.includes("POOL_TVL_BELOW_MIN")) return "Pools exist, but none meet the liquidity minimum.";
  return null;
}

export function whyGap(): string {
  return "Stock tokens keep trading when the US cash session is shut. The Chainlink feed then holds the last close, while a pool can print a different price. XPLOT measures that gap. It does not call either print wrong.";
}
