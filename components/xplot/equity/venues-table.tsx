"use client";

import { useState } from "react";
import { EmptyState } from "@/components/xplot/equity/empty";

export type VenueRow = {
  key: string;
  venue: string;
  pair: string;
  fee: string;
  price: string;
  tvl: string;
  depth: string;
  impact1k: string;
  impact10k: string;
  impact50k: string;
  confidence: string;
  tradeHref: string | null;
  empty: boolean;
};

export function VenuesTable({ rows }: { rows: VenueRow[] }) {
  const [showEmpty, setShowEmpty] = useState(false);
  const emptyCount = rows.filter((row) => row.empty).length;
  const filled = rows.filter((row) => !row.empty);

  if (rows.length === 0) {
    return <EmptyState title="No spot market">No active DEX pool is listed for this token.</EmptyState>;
  }

  if (filled.length === 0 && !showEmpty) {
    return (
      <div className="space-y-3">
        <EmptyState title="No pool data">No pool has a price or liquidity print.</EmptyState>
        <p className="flex flex-wrap items-center gap-2 text-sm" style={{ color: "var(--muted)" }}>
          <span>{emptyCount} empty pools hidden (no liquidity)</span>
          <button type="button" className="xplot-text-btn" onClick={() => setShowEmpty(true)}>
            Show empty pools
          </button>
        </p>
      </div>
    );
  }

  const visible = showEmpty ? rows : filled;
  return (
    <div className="space-y-2">
      <div className="xplot-scroll overflow-x-auto">
        <table className="xplot-table w-full text-left text-sm">
          <caption className="sr-only">Spot pools</caption>
          <thead>
            <tr>
              <th scope="col">Venue</th>
              <th scope="col">Pair</th>
              <th scope="col">Fee</th>
              <th scope="col">Price</th>
              <th scope="col">TVL</th>
              <th scope="col">Depth (±1%)</th>
              <th scope="col">Impact $1k</th>
              <th scope="col">Impact $10k</th>
              <th scope="col">Impact $50k</th>
              <th scope="col">Confidence</th>
              <th scope="col">Trade</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.key}>
                <td>{row.venue}</td>
                <td>{row.pair}</td>
                <td className="mono">{row.fee}</td>
                <td className="mono">{row.price}</td>
                <td className="mono">{row.tvl}</td>
                <td className="mono">{row.depth}</td>
                <td className="mono">{row.impact1k}</td>
                <td className="mono">{row.impact10k}</td>
                <td className="mono">{row.impact50k}</td>
                <td>{row.confidence}</td>
                <td>
                  {row.tradeHref ? (
                    <a href={row.tradeHref} rel="noopener noreferrer">Trade</a>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        ±1% depth is an in-range lower bound. Adjacent ticks are not included.
      </p>
      {emptyCount > 0 ? (
        <p className="flex flex-wrap items-center gap-2 text-sm" style={{ color: "var(--muted)" }}>
          <span>
            {showEmpty
              ? `${emptyCount} empty pools shown`
              : `${emptyCount} empty pools hidden (no liquidity)`}
          </span>
          <button type="button" className="xplot-text-btn" onClick={() => setShowEmpty((open) => !open)}>
            {showEmpty ? "Hide empty pools" : "Show empty pools"}
          </button>
        </p>
      ) : null}
    </div>
  );
}
