import { runTick } from "@/lib/collector/tick";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("unauthorized", { status: 401 });
  }
  const result = await runTick();
  return Response.json({ ok: result.ok, counts: result.counts, errors: result.errors });
}
