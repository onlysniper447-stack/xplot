# AUDIT

Existing tree audited against XPLOT v4 on 2026-10-12. The repository was a PreStocks desk (Solana marks, mock `lib/mock-data`, Tessera lane). It was not a Robinhood Chain product. Status below is the pre-change tree. The Robinhood path added after this audit is the product home.

| Check | Status | Evidence | Plan |
| --- | --- | --- | --- |
| Registry from `/rhj/assets`, not a hardcoded ticker list | Missing | The old desk used a fixed catalogue | Collector upserts chain 4663 deployments from the live assets payload |
| Feed addresses from Chainlink's list | Missing | No Chainlink client | Load `reference-data-directory.vercel.app/feeds-robinhood-mainnet.json` at runtime |
| No memory-sourced addresses | Bug | The old catalogue was a snapshot | Quote tokens cite `docs.robinhood.com/chain/contracts` and are checked with `symbol()` |
| DEX vs Chainlink compared per token | Missing | No Chainlink or DEX price | `spreadPct` takes per-token prices and does not accept a multiplier. Unit test covers the double-adjust |
| Oracle reads sanity-checked, reverts isolated | Missing | No oracle reader | `decodeOraclePrice` plus per-feed try/catch |
| Lanes: reference and perp never enter spot price or TVL | Missing | No venue lanes | `aggregateSpot` filters `lane === 'spot'`. Arcus is `reference` / `link_only` |
| No depth-based threshold loosening; 3-tick persistence | Missing | No alert engine | `persistSpreadAlert` and `alertThresholdPct` |
| Per-token session from live tradability, halts, pending multiplier | Missing | No session engine | `tradingCapabilities.overnight` (the live field; `allDayTradability` is not in the payload) |
| Holiday and early-close calendars populated | Missing | No calendar | `HOLIDAYS` and `EARLY_CLOSE` through 2027 |
| One failing source does not abort a tick | Missing | No collector | Section errors are collected; the tick still writes rows |
| Read-only: no signing, writes, wallet libraries | OK | No wagmi, RainbowKit, or `sendTransaction` in app code | `scripts/check-readonly.mjs` |
| UI states, API shape, tests | Missing | The old pages used a mock API | New `/`, `/e/[ticker]`, `/coverage`, `/verify`, `/v1/*` |

The PreStocks desk, Tessera lane, Jupiter quote client, and Solana mint catalogue were removed. Those routes (`/overview`, `/equity/[ticker]`, `/tessera`, `/explore`, `/markets`) are gone. The live product is Robinhood Chain only.
