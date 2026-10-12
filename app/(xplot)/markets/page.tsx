import Link from "next/link";
import { Chip, Freshness, OracleCell, SpreadCell, statusTone, tierTone } from "@/components/xplot/chips";
import { formatCompactUsd, formatPct, formatUsd } from "@/lib/xplot/format";
import { alertCopy } from "@/lib/xplot/engines";
import { coverageCounts, envelope, verifyAddress, type EquitySummary } from "@/lib/xplot/read";
import { referenceMid, robinhoodQuote } from "@/lib/xplot/reference";

export const dynamic = "force-dynamic";

function hasLivePrint(row: EquitySummary) {
  return row.oraclePrice != null || row.dexPrice != null;
}

function byLiquidity(a: EquitySummary, b: EquitySummary) {
  if (a.tvlUsd == null && b.tvlUsd == null) return a.ticker.localeCompare(b.ticker);
  if (a.tvlUsd == null) return 1;
  if (b.tvlUsd == null) return -1;
  if (a.tvlUsd !== b.tvlUsd) return b.tvlUsd - a.tvlUsd;
  return a.ticker.localeCompare(b.ticker);
}

function listHref(q: string, showAll: boolean) {
  const params = new URLSearchParams();
  if (q.trim()) params.set("q", q.trim());
  if (showAll) params.set("all", "1");
  const text = params.toString();
  return text ? `/markets?${text}` : "/markets";
}

export default async function HomePage({ searchParams }: { searchParams: Promise<{ q?: string; all?: string }> }) {
  const { q = "", all = "" } = await searchParams;
  const env = await envelope();
  const { counts, rows, tracked, alerts, largestSpread } = await coverageCounts();
  const showAll = all === "1";
  const needle = q.trim().toLowerCase();
  const universe = showAll ? rows : rows.filter(hasLivePrint);
  const shown = (needle
    ? universe.filter((row) => `${row.ticker} ${row.name} ${row.id} ${row.address}`.toLowerCase().includes(needle))
    : universe
  ).sort(byLiquidity);
  const reference = new Map<string, number | null>();
  await Promise.all(
    shown.map(async (row) => {
      reference.set(row.ticker, referenceMid(await robinhoodQuote(row.ticker)));
    }),
  );
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
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p style={{ color: "var(--muted)" }}>
              {showAll ? `${shown.length} listed tokens` : `${shown.length} tokens with an oracle or DEX print`}
            </p>
            <Link href={listHref(q, !showAll)} className="inline-flex min-h-12 items-center rounded-full border px-5 font-semibold no-underline" style={{ borderColor: "#FF8000" }}>
              {showAll ? "Show live data" : "Show all listed tokens"}
            </Link>
          </div>
          <EquityTable rows={shown} query={q} reference={reference} />
        </div>
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

function EquityTable({
  rows,
  query,
  reference,
}: {
  rows: EquitySummary[];
  query: string;
  reference: Map<string, number | null>;
}) {
  if (rows.length === 0) {
    return <p>{query.trim() ? `No listed Stock Token matches “${query}”.` : "No tokens with an oracle or DEX print in this view."}</p>;
  }
  return (
    <div>
      <div className="hidden md:block">
        <table className="xplot-table w-full text-left">
          <caption className="sr-only">Robinhood Stock Tokens with oracle or DEX prints. The Robinhood reference column is not onchain.</caption>
          <thead>
            <tr style={{ color: "var(--muted)" }}>
              <th scope="col" className="font-medium">Equity</th>
              <th scope="col" className="font-medium">DEX price</th>
              <th scope="col" className="font-medium">Oracle (age)</th>
              <th scope="col" className="font-medium">Robinhood reference<span className="block font-normal">not onchain</span></th>
              <th scope="col" className="font-medium">Spread</th>
              <th scope="col" className="font-medium">Liquidity</th>
              <th scope="col" className="font-medium">Status</th>
              <th scope="col" className="font-medium">Tier</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                <th scope="row" className="font-medium">
                  <Link href={`/e/${row.ticker}`}>{row.ticker}</Link>
                  <span className="mt-0.5 block text-xs font-normal" style={{ color: "var(--muted)" }}>{row.name.replace(/• Robinhood Token/g, "").trim()}</span>
                </th>
                <td className="mono">{formatUsd(row.dexPrice)}</td>
                <td><OracleCell row={row} /></td>
                <td className="mono" title="Robinhood reference quote. Not an on-chain price.">{formatUsd(reference.get(row.ticker) ?? null)}</td>
                <td><SpreadCell value={row.spreadPct} /></td>
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
            <p className="mono mt-2">DEX {formatUsd(row.dexPrice)}</p>
            <OracleCell row={row} />
            <p className="mono mt-1">Reference {formatUsd(reference.get(row.ticker) ?? null)} <span style={{ color: "var(--muted)" }}>not onchain</span></p>
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
