"use client";

import { Info } from "lucide-react";
import * as Tooltip from "@radix-ui/react-tooltip";

const ISSUER_NOTE =
  "A Robinhood Stock Token is an issuer debt security. It gives economic exposure and does not confer ownership or shareholder rights. Verified by XPLOT against the Robinhood asset registry.";

export function IssuerNote() {
  return (
    <Tooltip.Provider delayDuration={200}>
      <Tooltip.Root>
        <Tooltip.Trigger
          type="button"
          aria-label="Issuer note"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full"
          style={{ background: "transparent", color: "var(--text)", border: "1px solid var(--border)", fontWeight: 500 }}
        >
          <Info aria-hidden="true" size={16} />
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="bottom"
            align="start"
            sideOffset={8}
            collisionPadding={12}
            className="z-40 w-[min(22rem,calc(100vw-2rem))] rounded-[10px] border p-3 text-sm"
            style={{ background: "var(--bg)", color: "var(--text)", borderColor: "var(--border)" }}
          >
            {ISSUER_NOTE}
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
