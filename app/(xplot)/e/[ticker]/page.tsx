import Link from "next/link";
import { notFound } from "next/navigation";
import { Chip, Freshness, OracleCell, tierTone } from "@/components/xplot/chips";
import { GapInfo } from "@/components/xplot/equity/gap-info";
import { EquityTabs } from "@/components/xplot/equity/tabs";
import { VenuesTable, type VenueRow } from "@/components/xplot/equity/venues-table";
import { PriceChart } from "@/components/xplot/price-chart";
import { headerVerdict, verdict, whyGap } from "@/lib/xplot/copy";
import { liquidityConfidence } from "@/lib/xplot/engines";
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
  const venueRows: VenueRow[] = spot.map((market) => {
    const empty = [market.priceUsd, market.tvlUsd, market.depthUsd, market.impact1k, market.impact10k, market.impact50k].every((value) => value == null);
    const quote = market.quoteSymbol ?? "—";
    return {
      key: `${market.venueId}-${market.poolAddress ?? quote}-${market.feeBps ?? "na"}`,
      venue: market.venueId === "uniswap-v3" ? "Uniswap v3" : market.venueId,
      pair: `${equity.ticker}/${quote}`,
      fee: market.feeBps == null ? "—" : `${market.feeBps} bps`,
      price: formatUsd(market.priceUsd),
      tvl: formatCompactUsd(market.tvlUsd),
      depth: formatCompactUsd(market.depthUsd),
      impact1k: formatBps(market.impact1k),
      impact10k: formatBps(market.impact10k),
      impact50k: formatBps(market.impact50k),
      confidence: liquidityConfidence(market.depthUsd) ?? "—",
      tradeHref: market.deeplink,
      empty,
    };
  });

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

      <section className="xplot-card rounded-xl p-4" aria-label="Prices">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Price label="DEX price" value={formatUsd(equity.dexPrice)} hint="Per token, spot lane only" />
          <div title="Chainlink price per token, with the age of that print">
            <p className="text-xs" style={{ color: "var(--muted)" }}>Oracle price</p>
            <div className="mt-1">
              <OracleCell row={equity} />
            </div>
          </div>
          <Price label="Spread" value={formatPct(equity.spreadPct)} hint="Per token versus per token" />
          <Price label="Executable spread" value={formatPct(equity.executableSpread1kPct)} hint="Spread after a $1k quote impact" />
        </div>
      </section>

      <section aria-labelledby="chart-heading" className="xplot-card rounded-xl p-4">
        <h2 id="chart-heading" className="text-sm font-medium">DEX and oracle</h2>
        <div className="mt-3">
          <PriceChart points={series} />
        </div>
      </section>

      <EquityTabs
        panels={{
          overview: (
            <div className="space-y-4">
              <Freshness seconds={env.ages.collector_s} />
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                Underlying from the oracle: {formatUsd(equity.underlyingPrice)}. Multiplier {equity.multiplier ?? "—"}. {sessionLabel(equity.session, equity.sessionSource)}
              </p>
              {equity.tier !== "FULL" ? (
                <section className="xplot-card rounded-xl p-4">
                  <h2 className="text-sm font-medium">Data quality</h2>
                  <p className="mt-2 text-sm">This equity is {equity.tier}. {equity.reasons.length ? equity.reasons.join(", ") : "No extra reason code."}</p>
                </section>
              ) : null}
              {equity.session === "open" && reference ? (
                <p className="text-sm">
                  Chainlink vs Robinhood reference: {formatPct(reference.oracleVsReferencePct)} (reference generated {reference.generatedAt ?? "—"}).
                </p>
              ) : null}
            </div>
          ),
          venues: (
            <div className="space-y-6">
              <section aria-labelledby="venues-heading">
                <h2 id="venues-heading" className="text-sm font-medium">Spot venues</h2>
                <div className="mt-2">
                  <VenuesTable rows={venueRows} />
                </div>
              </section>
              <section aria-labelledby="ref-heading">
                <h2 id="ref-heading" className="text-sm font-medium">Reference quotes (not liquidity)</h2>
                <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>These prints are excluded from TVL and from the spot price.</p>
                <div className="xplot-scroll mt-2 overflow-x-auto">
                  <table className="xplot-table w-full text-left text-sm">
                    <caption className="sr-only">Reference quotes (not liquidity)</caption>
                    <thead>
                      <tr>
                        <th scope="col">Source</th>
                        <th scope="col">Quote</th>
                        <th scope="col">Note</th>
                        <th scope="col">Link</th>
                      </tr>
                    </thead>
                    <tbody>
                      {referenceMarkets.map((market) => (
                        <tr key={market.venueId}>
                          <td>{market.venueId === "arcus-spot" ? "Arcus" : market.venueId}</td>
                          <td className="mono">{formatUsd(market.priceUsd)}</td>
                          <td>Link only until a public read path is verified</td>
                          <td>
                            {market.deeplink ? (
                              <a href={market.deeplink} rel="noopener noreferrer">Trade</a>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      ))}
                      {referenceMarkets.some((market) => market.venueId === "arcus-spot") ? null : (
                        <tr>
                          <td>Arcus</td>
                          <td className="mono">—</td>
                          <td>No reference link stored.</td>
                          <td>—</td>
                        </tr>
                      )}
                      <tr>
                        <td>1inch</td>
                        <td className="mono">—</td>
                        <td>Not wired. No quote is shown.</td>
                        <td>—</td>
                      </tr>
                      <tr>
                        <td>Rialto</td>
                        <td className="mono">—</td>
                        <td>Not wired. No quote is shown.</td>
                        <td>—</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          ),
          token: (
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
          ),
          history: (
            <section className="xplot-card rounded-xl p-4">
              <h2 className="text-sm font-medium">Weekend scorecard</h2>
              <p className="mt-2 text-sm">Not enough data yet.</p>
            </section>
          ),
          api: (
            <section className="xplot-card rounded-xl p-4 text-sm">
              <h2 className="font-medium">Developer</h2>
              <pre className="mono mt-2 overflow-x-auto text-xs">{`curl ${process.env.NEXT_PUBLIC_BASE_URL ?? ""}/v1/equities/${equity.ticker}/health`}</pre>
              <p className="mt-2">
                <Link href="/v1/openapi.json" className="underline">OpenAPI</Link>
              </p>
            </section>
          ),
        }}
      />
    </article>
  );
}

function Price({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div title={hint}>
      <p className="text-xs" style={{ color: "var(--muted)" }}>{label}</p>
      <p className="mono xplot-figure mt-1 text-lg">{value}</p>
    </div>
  );
}
