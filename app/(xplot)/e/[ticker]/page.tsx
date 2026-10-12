import Link from "next/link";
import { notFound } from "next/navigation";
import { Chip, Freshness, OracleCell, tierTone } from "@/components/xplot/chips";
import { GapInfo } from "@/components/xplot/equity/gap-info";
import { PriceChart } from "@/components/xplot/price-chart";
import { headerVerdict, verdict, whyGap } from "@/lib/xplot/copy";
import { formatBps, formatCompactUsd, formatPct, formatUsd, shortAddress } from "@/lib/xplot/format";
import { actionsFor, alertFor, deviationSeries, envelope, getEquity, instrumentIdFor, marketsFor, referenceFor } from "@/lib/xplot/read";
import { sessionLabel } from "@/lib/xplot/session";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  return { title: ticker.toUpperCase() };
}

export default async function EquityPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  const equity = await getEquity(ticker);
  if (!equity) notFound();
  const instrumentId = await instrumentIdFor(equity.id);
  if (!instrumentId) notFound();
  const [markets, series, reference, actions, alert, env] = await Promise.all([
    marketsFor(instrumentId),
    deviationSeries(instrumentId, "1d"),
    referenceFor(instrumentId),
    actionsFor(instrumentId),
    alertFor(instrumentId),
    envelope(),
  ]);
  const spot = markets.filter((m) => m.lane === "spot");
  const referenceMarkets = markets.filter((m) => m.lane === "reference");
  const line = verdict({
    tier: equity.tier,
    halt: equity.halt,
    alert: equity.alert,
    session: equity.session,
    sessionSource: equity.sessionSource,
    oracle: equity.oracleState,
    spreadPct: equity.spreadPct,
    confidence: equity.liquidityConfidence,
  });
  const statusLine = headerVerdict({
    tier: equity.tier,
    halt: equity.halt,
    session: equity.session,
    sessionSource: equity.sessionSource,
    oracle: equity.oracleState,
    dexPrice: equity.dexPrice,
  });
  const displayName = equity.name.replace(/• Robinhood Token/g, "").trim();

  return (
    <article className="space-y-6">
      <header>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">{equity.ticker}</h1>
            <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>{displayName}</p>
          </div>
          <Chip tone={tierTone(equity.tier)} title={equity.reasons.join(", ") || "No coverage flags"}>{equity.tier}</Chip>
        </div>
        <p className="mt-3 flex items-center gap-2 text-sm">
          <span>{statusLine}</span>
          <GapInfo why={whyGap()} verdictText={line} alert={alert} notes={equity.notes} />
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <Freshness seconds={env.ages.collector_s} />
      </div>

      <section className="grid gap-3 md:grid-cols-4" aria-label="Prices">
        <Price label="DEX price" value={formatUsd(equity.dexPrice)} hint="Per token, spot lane only" />
        <div className="xplot-card rounded-xl p-3">
          <p className="text-xs" style={{ color: "var(--muted)" }}>Oracle</p>
          <OracleCell row={equity} />
        </div>
        <Price label="Spread" value={formatPct(equity.spreadPct)} hint="Per token versus per token" />
        <Price label="Executable spread, $1k" value={formatPct(equity.executableSpread1kPct)} hint="Spread after a $1k quote impact" />
      </section>
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Underlying from the oracle: {formatUsd(equity.underlyingPrice)}. Multiplier {equity.multiplier ?? "—"}. {sessionLabel(equity.session, equity.sessionSource)}
      </p>

      <section aria-labelledby="chart-heading" className="xplot-card rounded-xl p-4">
        <h2 id="chart-heading" className="text-sm font-medium">DEX and oracle</h2>
        <div className="mt-3">
          <PriceChart points={series} />
        </div>
      </section>

      {equity.tier !== "FULL" ? (
        <section className="xplot-card rounded-xl p-4">
          <h2 className="text-sm font-medium">Data quality</h2>
          <p className="mt-2 text-sm">This equity is {equity.tier}. {equity.reasons.length ? equity.reasons.join(", ") : "No extra reason code."}</p>
        </section>
      ) : null}

      <section aria-labelledby="instrument-heading">
        <h2 id="instrument-heading" className="text-sm font-medium">Instrument</h2>
        <div className="xplot-card mt-2 rounded-xl p-4">
          <p className="mono text-sm">{equity.id}</p>
          <p className="mt-2 text-sm">Issuer note · economic exposure only</p>
          <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
            A Robinhood Stock Token is an issuer debt security. It gives economic exposure and does not confer ownership or shareholder rights. Verified by XPLOT against the Robinhood asset registry.
          </p>
          <p className="mono mt-3 text-sm">
            <a href={`https://robinhoodchain.blockscout.com/address/${equity.address}`} rel="noopener noreferrer">
              {shortAddress(equity.address)}
            </a>
          </p>
          {equity.pendingMultiplier != null ? (
            <p className="mt-2 text-sm">A corporate action is pending. Alerts pause around the effective time.</p>
          ) : null}
          {actions[0] ? (
            <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
              {actions[0].type} · {actions[0].status} · {actions[0].process_date ?? "date unavailable"}
            </p>
          ) : null}
        </div>
      </section>

      <section aria-labelledby="venues-heading">
        <h2 id="venues-heading" className="text-sm font-medium">Spot venues</h2>
        {spot.length === 0 ? (
          <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>No active DEX market.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {spot.map((m) => (
              <li key={`${m.venueId}-${m.poolAddress}`} className="xplot-card rounded-xl p-3 text-sm">
                <p>{m.venueId} · {m.quoteSymbol} · fee {m.feeBps ?? "—"} bps</p>
                <p className="mono mt-1">{formatUsd(m.priceUsd)} · TVL {formatCompactUsd(m.tvlUsd)} · depth {formatCompactUsd(m.depthUsd)}</p>
                <p className="mt-1" style={{ color: "var(--muted)" }}>
                  $1k {formatBps(m.impact1k)} · $10k {formatBps(m.impact10k)} · $50k {formatBps(m.impact50k)}
                </p>
                <p className="text-xs" style={{ color: "var(--muted)" }}>±1% depth is an in-range lower bound. Adjacent ticks are not included.</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="ref-heading">
        <h2 id="ref-heading" className="text-sm font-medium">Reference quotes</h2>
        <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>Reference quote (not liquidity). These prints are excluded from TVL and from the spot price.</p>
        <ul className="mt-2 space-y-2">
          {referenceMarkets.map((m) => (
            <li key={m.venueId} className="xplot-card rounded-xl p-3 text-sm">
              <p>{m.venueId} · link only until a public read path is verified</p>
              {m.deeplink ? (
                <a href={m.deeplink} rel="noopener noreferrer" className="underline">
                  Trade on Arcus ↗
                </a>
              ) : null}
            </li>
          ))}
          <li className="text-sm" style={{ color: "var(--muted)" }}>
            1inch and Rialto are not wired. No quote is shown for them.
          </li>
        </ul>
      </section>

      {equity.session === "open" && reference ? (
        <p className="text-sm">
          Chainlink vs Robinhood reference: {formatPct(reference.oracleVsReferencePct)} (reference generated {reference.generatedAt ?? "—"}).
        </p>
      ) : null}

      <section className="xplot-card rounded-xl p-4">
        <h2 className="text-sm font-medium">Weekend scorecard</h2>
        <p className="mt-2 text-sm">Not enough data yet.</p>
      </section>

      <section className="xplot-card rounded-xl p-4 text-sm">
        <h2 className="font-medium">Developer</h2>
        <pre className="mono mt-2 overflow-x-auto text-xs">{`curl ${process.env.NEXT_PUBLIC_BASE_URL ?? ""}/v1/equities/${equity.ticker}/health`}</pre>
        <p className="mt-2">
          <Link href="/v1/openapi.json" className="underline">OpenAPI</Link>
        </p>
      </section>
    </article>
  );
}

function Price({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="xplot-card rounded-xl p-3" title={hint}>
      <p className="text-xs" style={{ color: "var(--muted)" }}>{label}</p>
      <p className="mono xplot-figure mt-1 text-lg">{value}</p>
    </div>
  );
}
