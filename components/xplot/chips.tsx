import { SPREAD_NEEDS_BOTH } from "@/lib/xplot/copy";
import { oracleFreshnessLabel } from "@/lib/xplot/engines";
import { formatAge, formatPct, formatUsd, freshnessLevel } from "@/lib/xplot/format";
import type { EquitySummary } from "@/lib/xplot/read";

const toneColor = {
  ok: "var(--ok)",
  warn: "var(--warn)",
  bad: "var(--bad)",
  info: "var(--info)",
  muted: "var(--muted)",
} as const;

export function Chip({
  tone,
  children,
  title,
}: {
  tone: keyof typeof toneColor;
  children: React.ReactNode;
  title?: string;
}) {
  const mark = tone === "ok" ? "●" : tone === "warn" ? "▲" : tone === "bad" ? "■" : "○";
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs"
      style={{ borderColor: "var(--border)", color: toneColor[tone] }}
    >
      <span aria-hidden="true">{mark}</span>
      {children}
    </span>
  );
}

export function tierTone(tier: EquitySummary["tier"]): keyof typeof toneColor {
  if (tier === "FULL") return "ok";
  if (tier === "DEGRADED") return "bad";
  if (tier === "ORACLE_ONLY" || tier === "DEX_ONLY") return "warn";
  return "muted";
}

export function statusTone(status: EquitySummary["status"]): keyof typeof toneColor {
  if (status === "Aligned") return "ok";
  if (status === "Dislocated" || status === "Halted") return "bad";
  if (status === "Delayed" || status === "Off-market") return "warn";
  return "muted";
}

export function OracleCell({ row }: { row: EquitySummary }) {
  if (row.oraclePrice == null) return <span title={row.reason ?? (row.reasons.join(", ") || "No oracle print")}>—</span>;
  const label = oracleFreshnessLabel({
    dataStatus: row.dataStatus,
    oracleState: row.oracleState,
    collectorAt: row.collectorAt,
  });
  const detail = row.dataStatus === "stale" ? label : `${label} · ${formatAge(row.oracleAgeS)}`;
  const title = row.dataStatus === "stale" ? label : `${label}. Updated ${row.oracleUpdatedAt ?? "unknown"}`;
  return (
    <span className="mono" title={title}>
      {formatUsd(row.oraclePrice)}
      <span className="mt-0.5 block text-xs" style={{ color: "var(--muted)" }}>
        {detail}
      </span>
    </span>
  );
}

export function Freshness({ seconds }: { seconds: number | null }) {
  const level = freshnessLevel(seconds);
  const tone = level === "bad" ? "bad" : level === "warn" ? "warn" : level === "ok" ? "ok" : "muted";
  const text = seconds == null ? "No snapshot yet" : `Updated ${formatAge(seconds)} ago`;
  return <Chip tone={tone}>{text}</Chip>;
}

export function SpreadCell({ value }: { value: number | null }) {
  if (value == null) return <span title={SPREAD_NEEDS_BOTH}>—</span>;
  const tone = Math.abs(value) >= 1 ? "var(--warn)" : "var(--text)";
  return (
    <span className="mono" style={{ color: tone }} title="DEX token price versus Chainlink token price">
      {formatPct(value)}
    </span>
  );
}
