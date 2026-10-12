import { ok } from "@/lib/xplot/http";
import { envelope, openIssues } from "@/lib/xplot/read";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return ok(await envelope({ issues: await openIssues() }));
}
