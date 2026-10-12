"use client";

import { useEffect, useRef } from "react";
import { ColorType, LineSeries, createChart, type IChartApi, type UTCTimestamp } from "lightweight-charts";

type Point = { ts: string; dexPrice: number | null; oraclePrice: number | null; spreadPct: number | null; session: string };

export function PriceChart({ points }: { points: Point[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const usable = points.filter((p) => p.dexPrice != null || p.oraclePrice != null);

  useEffect(() => {
    const el = ref.current;
    if (!el || usable.length < 2) return;
    const chart: IChartApi = createChart(el, {
      width: el.clientWidth,
      height: 320,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#b7b2a8", fontSize: 11 },
      grid: { vertLines: { color: "rgba(255,128,0,0.18)" }, horzLines: { color: "rgba(244,241,233,0.08)" } },
      timeScale: { timeVisible: true, secondsVisible: false },
    });
    const dex = chart.addSeries(LineSeries, { color: "#FF8000", lineWidth: 2, title: "DEX" });
    const oracle = chart.addSeries(LineSeries, { color: "#e6e1d6", lineWidth: 1, lineStyle: 2, title: "Oracle" });
    const toTime = (ts: string) => Math.floor(new Date(ts).getTime() / 1000) as UTCTimestamp;
    dex.setData(usable.filter((p) => p.dexPrice != null).map((p) => ({ time: toTime(p.ts), value: p.dexPrice as number })));
    oracle.setData(usable.filter((p) => p.oraclePrice != null).map((p) => ({ time: toTime(p.ts), value: p.oraclePrice as number })));
    chart.timeScale().fitContent();
    const onResize = () => chart.applyOptions({ width: el.clientWidth });
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      chart.remove();
    };
  }, [points]);

  if (usable.length < 2) {
    return (
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        {usable.length === 0
          ? "No prints yet. The chart fills as the collector runs. History is not backfilled."
          : `One print so far (${usable[0].ts}). A line needs a second print. This is not a backfilled history.`}
      </p>
    );
  }

  const closed = usable.some((p) => p.session === "closed");
  return (
    <div>
      <div ref={ref} className="relative h-80" />
      {closed ? (
        <p className="mt-2 text-xs" style={{ color: "var(--warn)" }}>
          <span aria-hidden="true">▲ </span>
          This range includes a closed session. Oracle points in that session are the last close.
        </p>
      ) : (
        <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
          Closed-session shading appears when a stored print falls on a weekend or holiday.
        </p>
      )}
      <table className="sr-only">
        <caption>DEX and oracle prints</caption>
        <thead>
          <tr>
            <th scope="col">Time</th>
            <th scope="col">DEX</th>
            <th scope="col">Oracle</th>
            <th scope="col">Session</th>
          </tr>
        </thead>
        <tbody>
          {usable.slice(-12).map((p) => (
            <tr key={p.ts}>
              <td>{p.ts}</td>
              <td>{p.dexPrice ?? "—"}</td>
              <td>{p.oraclePrice ?? "—"}</td>
              <td>{p.session}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
