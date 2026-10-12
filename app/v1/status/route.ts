import { ok } from "@/lib/xplot/http";
import { coverageCounts, envelope } from "@/lib/xplot/read";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const { counts, tracked, alerts, largestSpread } = await coverageCounts();
  return ok(await envelope({ counts, trackedLiquidityUsd: tracked, activeAlerts: alerts, largestSpreadPct: largestSpread }));
}
