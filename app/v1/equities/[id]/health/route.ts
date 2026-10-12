import { fail, ok } from "@/lib/xplot/http";
import { alertFor, envelope, getEquity, instrumentIdFor, referenceFor } from "@/lib/xplot/read";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const equity = await getEquity(id);
  if (!equity) return fail("NOT_FOUND", "No listed Stock Token matches that id.", 404);
  const instrumentId = await instrumentIdFor(equity.id);
  const reference = instrumentId ? await referenceFor(instrumentId) : null;
  const alert = instrumentId ? await alertFor(instrumentId) : null;
  return ok(
    await envelope({
      id: equity.id,
      session: equity.session,
      session_source: equity.sessionSource,
      oracle_state: equity.oracleState,
      spread_pct: equity.spreadPct,
      executable_spread_1k_pct: equity.executableSpread1kPct,
      alert,
      coverage_tier: equity.tier,
      coverage_reasons: equity.reasons,
      status: equity.dataStatus,
      reason: equity.reason,
      oracle_vs_reference_pct: reference?.oracleVsReferencePct ?? null,
      multiplier: equity.multiplier,
      pending_multiplier: equity.pendingMultiplier,
      oracle_age_s: equity.oracleAgeS,
      as_of_print: equity.asOf,
    }),
  );
}
