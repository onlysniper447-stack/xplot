"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BadgeCheck, BarChart3, Code2, ShieldCheck } from "lucide-react";
import { DISCLAIMER } from "@/lib/xplot/disclaimer";

type Market = { state: "open" | "pre" | "post" | "closed"; headline: string; detail: string };

const items = [
  { href: "/markets", label: "Markets", icon: BarChart3 },
  { href: "/coverage", label: "Coverage", icon: ShieldCheck },
  { href: "/verify", label: "Verify", icon: BadgeCheck },
  { href: "/api", label: "API", icon: Code2 },
];

function isCurrent(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

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
  const pathname = usePathname();
  const [query, setQuery] = useState("");

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
      const command = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      if (typing || (!command && event.key !== "/")) return;
      event.preventDefault();
      document.getElementById("xplot-search")?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const tone = market.state === "open" ? "ok" : market.state === "closed" ? "bad" : "warn";

  return (
    <div className="xplot-app">
      <header className="sticky top-0 z-20 border-b" style={{ background: "var(--bg)", borderColor: "#ff8000" }}>
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4">
          <Link href="/" className="shrink-0 rounded-full px-3 py-1 text-sm font-semibold tracking-tight no-underline" style={{ background: "#FF8000", color: "#111111" }}>
            XPLOT
          </Link>
          <nav className="hidden min-h-12 flex-1 items-center gap-2 sm:flex" aria-label="Product">
            {items.map((item) => (
              <NavTab key={item.href} href={item.href} label={item.label} icon={item.icon} current={isCurrent(pathname, item.href)} />
            ))}
          </nav>
          <span className="ml-auto hidden rounded-full border px-3 py-1 text-xs sm:inline" style={{ borderColor: "#FF8000", color: "#111111" }}>
            Robinhood Chain
          </span>
        </div>
        <form action="/markets" className="mx-auto max-w-6xl px-4 py-3">
          <label className="sr-only" htmlFor="xplot-search">
            Search ticker, name, or address
          </label>
          <input
            id="xplot-search"
            name="q"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ticker, name, or address"
            className="xplot-card h-12 w-full rounded-full px-4 text-base outline-none"
          />
        </form>
        <div className="mx-auto flex max-w-6xl flex-wrap items-baseline gap-x-4 gap-y-1 px-4 pb-3 text-[15px] leading-5">
          <p style={{ color: tone === "ok" ? "var(--ok)" : tone === "bad" ? "var(--bad)" : "var(--warn)" }}>
            <span aria-hidden="true">{tone === "ok" ? "●" : tone === "bad" ? "■" : "▲"} </span>
            {market.headline}
            <span style={{ color: "var(--muted)" }}> · {market.detail}</span>
          </p>
          <Link href="/coverage" className="no-underline" style={{ color: "var(--muted)" }}>
            {coverage}
          </Link>
        </div>
        {adapterBanner ? (
          <p className="mx-auto max-w-6xl px-4 pb-2 text-[15px]" role="status" style={{ color: "var(--warn)" }}>
            <span aria-hidden="true">▲ </span>
            {adapterBanner}
          </p>
        ) : null}
        {stallBanner ? (
          <p className="mx-auto max-w-6xl px-4 pb-2 text-[15px]" role="status" style={{ color: "var(--warn)" }}>
            <span aria-hidden="true">▲ </span>
            {stallBanner}
          </p>
        ) : null}
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 pb-28 sm:pb-6">{children}</main>
      <footer className="mx-auto max-w-6xl px-4 pb-28 text-xs leading-5 sm:pb-10" style={{ color: "var(--muted)" }}>
        <p>{DISCLAIMER}</p>
        <p className="mt-2">
          Sources: Robinhood /rhj/assets, /rhj/prices, /rhj/corporate-actions, Chainlink reference-data directory, on-chain reads via the public Robinhood Chain RPC. No wallet is required.
        </p>
      </footer>
      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex border-t sm:hidden"
        style={{ background: "var(--bg)", borderColor: "#ff8000", minHeight: 56, paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Product"
      >
        {items.map((item) => (
          <NavTab key={item.href} href={item.href} label={item.label} icon={item.icon} current={isCurrent(pathname, item.href)} compact />
        ))}
      </nav>
    </div>
  );
}

function NavTab({
  href,
  label,
  icon: Icon,
  current,
  compact = false,
}: {
  href: string;
  label: string;
  icon: typeof BarChart3;
  current: boolean;
  compact?: boolean;
}) {
  const className = compact
    ? "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-xs font-semibold no-underline"
    : "inline-flex min-h-12 items-center gap-2 rounded-full px-5 py-3 text-base font-semibold no-underline";
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={`xplot-tab ${className}`}
      style={current ? { background: "#FF8000", color: "#111111" } : { color: "#111111" }}
    >
      <Icon aria-hidden="true" size={compact ? 18 : 18} />
      <span>{label}</span>
    </Link>
  );
}
