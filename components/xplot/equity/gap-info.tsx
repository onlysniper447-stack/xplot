"use client";

import { Info } from "lucide-react";
import * as Popover from "@radix-ui/react-popover";
import { formatPct } from "@/lib/xplot/format";

export function GapInfo({
  why,
  verdictText,
  alert,
  notes,
}: {
  why: string;
  verdictText: string;
  alert: { startedAt: string; lastSeenAt: string; peak: number | null; kind: string } | null;
  notes: string[];
}) {
  return (
    <Popover.Root>
      <Popover.Trigger
        type="button"
        aria-label="Why is there a gap?"
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
        style={{ background: "transparent", color: "var(--text)", border: "1px solid var(--border)", fontWeight: 500 }}
      >
        <Info aria-hidden="true" size={16} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="start"
          sideOffset={8}
          collisionPadding={12}
          className="z-40 w-[min(22rem,calc(100vw-2rem))] rounded-[10px] border p-3 text-sm shadow-none"
          style={{ background: "var(--bg)", color: "var(--text)", borderColor: "var(--border)" }}
        >
          <p className="font-medium">Why is there a gap?</p>
          <p className="mt-2" style={{ color: "var(--muted)" }}>{why}</p>
          <p className="mt-3">{verdictText}</p>
          {alert ? (
            <p className="mt-2" style={{ color: "var(--muted)" }}>
              Open since {alert.startedAt}. Last seen {alert.lastSeenAt}. Peak spread {formatPct(alert.peak)}. Kind {alert.kind}.
            </p>
          ) : (
            <p className="mt-2" style={{ color: "var(--muted)" }}>No open dislocation alert.</p>
          )}
          {notes.map((note) => (
            <p key={note} className="mt-2" style={{ color: "var(--warn)" }}>{note}</p>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
