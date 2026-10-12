import { fail, ok } from "@/lib/xplot/http";
import { deviationSeries, envelope, getEquity, instrumentIdFor } from "@/lib/xplot/read";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const equity = await getEquity(id);
  if (!equity) return fail("NOT_FOUND", "No listed Stock Token matches that id.", 404);
  const instrumentId = await instrumentIdFor(equity.id);
  if (!instrumentId) return fail("NOT_FOUND", "No listed Stock Token matches that id.", 404);
  const rangeParam = new URL(request.url).searchParams.get("range") ?? "1d";
  const range = rangeParam === "7d" || rangeParam === "30d" ? rangeParam : "1d";
  const series = await deviationSeries(instrumentId, range);
  return ok(await envelope({ id: equity.id, range, series }));
}
