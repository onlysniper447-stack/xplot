import { alertCopy, type OracleState, type SessionName, type Tier } from "./engines";
import { formatPct } from "./format";
import { sessionLabel } from "./session";

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

export function whyGap(): string {
  return "Stock tokens keep trading when the US cash session is shut. The Chainlink feed then holds the last close, while a pool can print a different price. XPLOT measures that gap. It does not call either print wrong.";
}
