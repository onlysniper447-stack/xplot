import Link from "next/link";
import { Chip, Freshness, OracleCell, SpreadCell, statusTone, tierTone } from "@/components/xplot/chips";
import { formatCompactUsd, formatPct, formatUsd } from "@/lib/xplot/format";
import { alertCopy } from "@/lib/xplot/engines";
import { coverageCounts, envelope, verifyAddress } from "@/lib/xplot/read";

export const dynamic = "force-dynamic";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const env = await envelope();
  const { counts, rows, tracked, alerts, largestSpread } = await coverageCounts();
  const needle = q.trim().toLowerCase();
  const shown = needle
    ? rows.filter((row) => `${row.ticker} ${row.name} ${row.id} ${row.address}`.toLowerCase().includes(needle))
    : rows;
  const address = /^0x[0-9a-fA-F]{40}$/.test(q.trim()) ? await verifyAddress(q.trim()) : null;
  const active = rows.filter((row) => row.alert);
  const age = env.ages.collector_s;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide" style={{ color: "var(--muted)" }}>
            The truth layer for 24/7 stock tokens
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Is this price trustworthy right now?</h1>
        </div>
        <Freshness seconds={age} />
      </div>

      {address && !address.verified ? (
        <p className="rounded-xl border p-4 text-sm" style={{ borderColor: "var(--bad)", color: "var(--bad)" }} role="status">
          <span aria-hidden="true">■ </span>
          Not verified. This may be a lookalike token.
        </p>
      ) : null}
      {address?.verified ? (
        <p className="rounded-xl border p-4 text-sm" role="status">
          Verified: {address.equity.id}.{" "}
          <Link href={`/e/${address.equity.ticker}`} className="underline">
            Open the canonical card
          </Link>
        </p>
      ) : null}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Market summary">
        <Stat label="Listed tokens" value={String(counts.listed)} />
        <Stat label="Active alerts" value={String(alerts)} />
        <Stat label="Largest current spread" value={largestSpread == null ? "—" : formatPct(largestSpread)} />
        <Stat label="Tracked liquidity" value={formatCompactUsd(tracked)} />
      </section>

      <section aria-labelledby="watch-heading" className="xplot-card rounded-xl p-4">
        <h2 id="watch-heading" className="text-sm font-medium">
          Watch feed
        </h2>
        {active.length === 0 ? (
          <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
            No active alerts. Prices look aligned right now.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {active.slice(0, 8).map((row) => (
              <li key={row.id}>
                <Link href={`/e/${row.ticker}`} className="text-sm">
                  <span className="mono">{row.ticker}</span>
                  <span style={{ color: "var(--muted)" }}> · {alertCopy(row.alert ?? "", row.spreadPct, row.liquidityConfidence)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {rows.length === 0 ? (
        <p className="xplot-card rounded-xl p-4 text-sm">
          No snapshot yet. The collector reads the Robinhood asset registry before this table can fill. Run <span className="mono">npm run collector</span>.
        </p>
      ) : (
        <EquityTable rows={shown} query={q} />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="xplot-card rounded-xl p-3">
      <p className="text-xs" style={{ color: "var(--muted)" }}>{label}</p>
      <p className="mono xplot-figure mt-1 text-lg">{value}</p>
    </div>
  );
}

function EquityTable({ rows, query }: { rows: Awaited<ReturnType<typeof coverageCounts>>["rows"]; query: string }) {
  if (rows.length === 0) {
    return <p className="text-sm">No listed Stock Token matches “{query}”.</p>;
  }
  return (
    <div>
      <div className="hidden md:block">
        <table className="xplot-table w-full text-left">
          <caption className="sr-only">Listed Robinhood Stock Tokens</caption>
          <thead>
            <tr style={{ color: "var(--muted)" }}>
              {["Equity", "DEX price", "Oracle (age)", "Spread", "Liquidity", "Status", "Tier"].map((h) => (
                <th key={h} scope="col" className="px-2 py-2 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                <th scope="row" className="px-2 py-3 font-medium">
                  <Link href={`/e/${row.ticker}`}>{row.ticker}</Link>
                  <span className="mt-0.5 block text-xs font-normal" style={{ color: "var(--muted)" }}>{row.name.replace(/• Robinhood Token/g, "").trim()}</span>
                </th>
                <td className="mono px-2 py-3">{formatUsd(row.dexPrice)}</td>
                <td className="px-2 py-3"><OracleCell row={row} /></td>
                <td className="px-2 py-3"><SpreadCell value={row.spreadPct} /></td>
                <td className="px-2 py-3">{row.liquidityConfidence ?? "—"}<span className="block text-xs" style={{ color: "var(--muted)" }}>{formatCompactUsd(row.tvlUsd)}</span></td>
                <td className="px-2 py-3"><Chip tone={statusTone(row.status)}>{row.status}</Chip></td>
                <td className="px-2 py-3">
                  <Chip tone={tierTone(row.tier)} title={row.reasons.join(", ")}>{row.tier}</Chip>
                  {row.notes.map((note) => (
                    <span key={note} className="mt-1 block text-xs" style={{ color: "var(--muted)" }}>{note}</span>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="space-y-3 md:hidden">
        {rows.map((row) => (
          <li key={row.id} className="xplot-card rounded-xl p-3">
            <Link href={`/e/${row.ticker}`} className="font-medium">{row.ticker}</Link>
            <p className="text-xs" style={{ color: "var(--muted)" }}>{row.name}</p>
            <p className="mono mt-2 text-sm">DEX {formatUsd(row.dexPrice)}</p>
            <OracleCell row={row} />
            <div className="mt-2 flex flex-wrap gap-2">
              <Chip tone={statusTone(row.status)}>{row.status}</Chip>
              <Chip tone={tierTone(row.tier)}>{row.tier}</Chip>
              {row.notes.map((note) => (
                <span key={note} className="text-xs" style={{ color: "var(--muted)" }}>{note}</span>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
