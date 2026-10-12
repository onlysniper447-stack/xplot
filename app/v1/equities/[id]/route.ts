import { fail, ok } from "@/lib/xplot/http";
import { actionsFor, alertFor, envelope, getEquity, instrumentIdFor, marketsFor, referenceFor } from "@/lib/xplot/read";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const equity = await getEquity(id);
  if (!equity) return fail("NOT_FOUND", "No listed Stock Token matches that id.", 404);
  const instrumentId = await instrumentIdFor(equity.id);
  if (!instrumentId) return fail("NOT_FOUND", "No listed Stock Token matches that id.", 404);
  const markets = await marketsFor(instrumentId);
  return ok(
    await envelope({
      equity,
      markets: {
        spot: markets.filter((m) => m.lane === "spot"),
        reference: markets.filter((m) => m.lane === "reference"),
        derivatives: markets.filter((m) => m.lane === "derivatives"),
      },
      reference: await referenceFor(instrumentId),
      corporateActions: await actionsFor(instrumentId),
      alert: await alertFor(instrumentId),
      scorecard: { sampleCount: 0, medianErrorPct: null, rows: [] },
    }),
  );
}
