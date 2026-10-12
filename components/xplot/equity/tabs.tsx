"use client";

import { useEffect, useState, type ReactNode } from "react";
import * as Tabs from "@radix-ui/react-tabs";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "venues", label: "Venues" },
  { id: "token", label: "Token" },
  { id: "history", label: "History" },
  { id: "api", label: "API" },
] as const;

export type EquityTab = (typeof TABS)[number]["id"];

function tabFromHash(hash: string): EquityTab {
  const id = hash.replace(/^#/, "");
  return TABS.some((tab) => tab.id === id) ? (id as EquityTab) : "overview";
}

export function EquityTabs({ panels }: { panels: Record<EquityTab, ReactNode> }) {
  const [tab, setTab] = useState<EquityTab>("overview");

  useEffect(() => {
    const apply = () => setTab(tabFromHash(window.location.hash));
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, []);

  function select(next: string) {
    const value = tabFromHash(`#${next}`);
    setTab(value);
    const url = `${window.location.pathname}${window.location.search}#${value}`;
    if (window.location.hash !== `#${value}`) window.history.replaceState(null, "", url);
  }

  return (
    <Tabs.Root value={tab} onValueChange={select} activationMode="automatic">
      <Tabs.List aria-label="Equity sections" className="xplot-scroll -mx-1 flex gap-1 overflow-x-auto px-1">
        {TABS.map((item) => (
          <Tabs.Trigger key={item.id} value={item.id} className="xplot-equity-tab">
            {item.label}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      {TABS.map((item) => (
        <Tabs.Content key={item.id} value={item.id} className="mt-4" tabIndex={0}>
          {panels[item.id]}
        </Tabs.Content>
      ))}
    </Tabs.Root>
  );
}
