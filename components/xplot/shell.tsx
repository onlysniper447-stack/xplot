"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DISCLAIMER } from "@/lib/xplot/disclaimer";

type Market = { state: "open" | "pre" | "post" | "closed"; headline: string; detail: string };

export function Shell({
  children,
  market,
  coverage,
  adapterBanner,
  stallBanner,
}: {
  children: React.ReactNode;
  market: Market;
  coverage: string;
  adapterBanner?: string | null;
  stallBanner?: string | null;
}) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "/" && !(event.target instanceof HTMLInputElement)) {
        event.preventDefault();
        document.getElementById("xplot-search")?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const tone = market.state === "open" ? "ok" : market.state === "closed" ? "bad" : "warn";

  return (
    <div className="xplot-app">
      <header className="border-b" style={{ borderColor: "#ff8000" }}>
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <Link href="/" className="rounded-full px-3 py-1 text-sm font-semibold tracking-tight" style={{ background: "#FF8000", color: "#111111", textDecoration: "none" }}>
            XPLOT
          </Link>
          <form action="/markets" className="min-w-[12rem] flex-1">
            <label className="sr-only" htmlFor="xplot-search">
              Search ticker, name, or address
            </label>
            <input
              id="xplot-search"
              name="q"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Ticker, name, or address"
              className="xplot-card h-11 w-full rounded-full px-4 text-sm outline-none"
            />
          </form>
          <span className="rounded-full border px-3 py-1 text-xs" style={{ borderColor: "#FF8000", color: "#111111" }}>
            Robinhood Chain
          </span>
        </div>
        <div className="mx-auto flex max-w-6xl flex-wrap gap-x-4 gap-y-1 px-4 pb-3 text-sm">
          <p style={{ color: tone === "ok" ? "var(--ok)" : tone === "bad" ? "var(--bad)" : "var(--warn)" }}>
            <span aria-hidden="true">{tone === "ok" ? "●" : tone === "bad" ? "■" : "▲"} </span>
            {market.headline}
            <span style={{ color: "var(--muted)" }}> · {market.detail}</span>
          </p>
          <Link href="/coverage" style={{ color: "var(--muted)" }}>
            {coverage}
          </Link>
        </div>
        {adapterBanner ? (
          <p className="mx-auto max-w-6xl px-4 pb-2 text-sm" role="status" style={{ color: "var(--warn)" }}>
            <span aria-hidden="true">▲ </span>
            {adapterBanner}
          </p>
        ) : null}
        {stallBanner ? (
          <p className="mx-auto max-w-6xl px-4 pb-2 text-sm" role="status" style={{ color: "var(--warn)" }}>
            <span aria-hidden="true">▲ </span>
            {stallBanner}
          </p>
        ) : null}
        <nav className="mx-auto flex max-w-6xl gap-4 px-4 pb-3 text-sm" aria-label="Product">
          <Link href="/markets" className="xplot-nav">Markets</Link>
          <Link href="/coverage" className="xplot-nav">Coverage</Link>
          <Link href="/verify" className="xplot-nav">Verify</Link>
          <Link href="/api" className="xplot-nav">API</Link>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      <footer className="mx-auto max-w-6xl px-4 pb-10 text-xs leading-5" style={{ color: "var(--muted)" }}>
        <p>{DISCLAIMER}</p>
        <p className="mt-2">
          Sources: Robinhood /rhj/assets, /rhj/prices, /rhj/corporate-actions, Chainlink reference-data directory, on-chain reads via the public Robinhood Chain RPC. No wallet is required.
        </p>
      </footer>
    </div>
  );
}
