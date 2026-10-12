import { fail, ok } from "@/lib/xplot/http";
import { envelope, getEquity } from "@/lib/xplot/read";
import { nyseStrip, sessionLabel } from "@/lib/xplot/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const equity = await getEquity(id);
  if (!equity) return fail("NOT_FOUND", "No listed Stock Token matches that id.", 404);
  return ok(
    await envelope({
      id: equity.id,
      session: equity.session,
      source: equity.sessionSource,
      label: sessionLabel(equity.session, equity.sessionSource),
      nyse: nyseStrip(new Date()),
    }),
  );
}
