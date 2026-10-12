import { Chip, tierTone } from "@/components/xplot/chips";
import { coverageCounts } from "@/lib/xplot/read";

export const dynamic = "force-dynamic";

export const metadata = { title: "Coverage" };

export default async function CoveragePage() {
  const { counts, rows } = await coverageCounts();
  const csv = ["ticker,tier,reasons,feed,pools", ...rows.map((r) => `${r.ticker},${r.tier},"${r.reasons.join(" ")}",${r.feedStatus},${r.poolCount}`)].join("\n");
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Coverage</h1>
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Every chain-4663 deployment from the Robinhood asset registry, with an honest tier. Nothing is dropped because a feed or pool is missing.
      </p>
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {(["listed", "FULL", "ORACLE_ONLY", "DEX_ONLY", "LISTED_ONLY", "DEGRADED"] as const).map((key) => (
          <div key={key} className="xplot-card rounded-xl p-3">
            <p className="text-xs" style={{ color: "var(--muted)" }}>{key}</p>
            <p className="mono xplot-figure text-lg">{key === "listed" ? counts.listed : counts[key]}</p>
          </div>
        ))}
      </section>
      {rows.length === 0 ? (
        <p className="text-sm">No snapshot yet. Run the collector, then reload.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Coverage by token</caption>
            <thead>
              <tr style={{ color: "var(--muted)" }}>
                <th scope="col" className="py-2">Token</th>
                <th scope="col">Tier</th>
                <th scope="col">Reasons</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <th scope="row" className="py-2 font-medium">{row.ticker}</th>
                  <td><Chip tone={tierTone(row.tier)}>{row.tier}</Chip></td>
                  <td style={{ color: "var(--muted)" }}>{row.reasons.join(", ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <a
        href={`data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`}
        download="xplot-coverage.csv"
        className="xplot-btn inline-flex h-11 items-center rounded-full px-4 text-sm"
        style={{ textDecoration: "none" }}
      >
        Download CSV
      </a>
    </div>
  );
}
