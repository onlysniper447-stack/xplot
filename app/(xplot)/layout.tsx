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
    const { counts } = await coverageCounts();
    const age = env.ages.collector_s;
    coverage = `${counts.listed} listed · ${counts.FULL} live · ${counts.ORACLE_ONLY} oracle-only · ${counts.DEGRADED} degraded`;
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
