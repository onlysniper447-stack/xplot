import { fail, ok } from "@/lib/xplot/http";
import { coverageCounts, envelope, listEquities } from "@/lib/xplot/read";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const tier = url.searchParams.get("tier") ?? undefined;
    const assetClass = url.searchParams.get("asset_class") ?? undefined;
    const hasAlert = url.searchParams.get("has_alert") === "true";
    const q = url.searchParams.get("q") ?? undefined;
    const rows = await listEquities({ tier, assetClass, hasAlert: hasAlert || undefined, q });
    const { counts } = await coverageCounts();
    return ok(await envelope({ counts, equities: rows }));
  } catch (error) {
    return fail("READ_FAILED", error instanceof Error ? error.message : "Could not read equities", 500);
  }
}
