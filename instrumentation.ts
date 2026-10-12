export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.XPLOT_EMBED_COLLECTOR === "0" || process.env.VERCEL) return;
  const { startEmbeddedCollector } = await import("./lib/collector/loop");
  startEmbeddedCollector();
}
