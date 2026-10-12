import { ok } from "@/lib/xplot/http";
import { coverageCounts, envelope } from "@/lib/xplot/read";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const { counts, rows } = await coverageCounts();
  return ok(
    await envelope({
      counts,
      tokens: rows.map((row) => ({
        id: row.id,
        ticker: row.ticker,
        name: row.name,
        tier: row.tier,
        reasons: row.reasons,
        feedStatus: row.feedStatus,
        poolCount: row.poolCount,
        asOf: row.asOf,
      })),
    }),
  );
}
