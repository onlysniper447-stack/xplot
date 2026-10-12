import { Inter, JetBrains_Mono } from "next/font/google";
import { Shell } from "@/components/xplot/shell";
import { ADAPTER_DOWN_NOTE } from "@/lib/xplot/engines";
import { formatAge } from "@/lib/xplot/format";
import { coverageCounts, envelope } from "@/lib/xplot/read";

const sans = Inter({ subsets: ["latin"], variable: "--font-xplot-sans" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-xplot-mono" });

export const dynamic = "force-dynamic";

export default async function XplotLayout({ children }: { children: React.ReactNode }) {
  let market: { state: "open" | "pre" | "post" | "closed"; headline: string; detail: string } = {
    state: "closed",
    headline: "NYSE: CLOSED",
    detail: "session clock unavailable",
  };
  let coverage = "Coverage has not been written yet";
  let adapterBanner: string | null = null;
  let stallBanner: string | null = null;
  try {
    const env = await envelope();
    market = env.market;
    const { counts, rows } = await coverageCounts();
    const age = env.ages.collector_s;
    const statusCounts = { live: 0, stale: 0, degraded: 0, no_data: 0 };
    for (const row of rows) statusCounts[row.dataStatus] += 1;
    coverage = `${counts.listed} listed · ${statusCounts.live} live · ${statusCounts.stale} stale · ${statusCounts.degraded} degraded · ${statusCounts.no_data} no data`;
    if (age != null) coverage += ` · collector ${formatAge(age)} ago`;
    if (env.collector?.uniswapDown) adapterBanner = ADAPTER_DOWN_NOTE;
    stallBanner = env.stallMessage;
  } catch {
    coverage = "Database is not ready";
  }
  return (
    <div className={`${sans.variable} ${mono.variable}`}>
      <Shell market={market} coverage={coverage} adapterBanner={adapterBanner} stallBanner={stallBanner}>
        {children}
      </Shell>
    </div>
  );
}
