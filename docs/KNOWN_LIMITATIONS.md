# Known limitations

Verified against live sources on 2026-10-12. Items that were not observed are listed as unverified. They are not filled with placeholders.

## Verified

1. **Multiplier.** Chainlink's Robinhood page states token price = underlying equity market price × `uiMultiplier()`. `/rhj/prices` bid and ask are raw underlying quotes. The collector compares a pool price to the Chainlink answer directly, and converts with the multiplier only for the underlying figure and for the Robinhood reference cross-check (`mid × currentMultiplier`). `CRWD` was listed with `currentMultiplier` `4`. The unit test locks the per-token comparison. A live CRWD feed was not in the Chainlink directory sample (no `Robinhood CRWD` row), so the empirical feed-versus-raw check for a 4× name waits on a name that has both a feed and a multiplier other than 1.
2. **`/prices` shape.** The live payload is `{ quotes: [{ bid, ask, currency, dailyTradingVolume, isTradingHalt, generatedAt, ... }] }`, not a flat object. At 2026-10-12 11:58 UTC (Monday pre-market, 07:58 ET) NVDA, AAPL, and CRWD returned live bid/ask and `isTradingHalt: false`. A closed weekend response was not observed on this run. Closed-session logic does not treat `/prices` as a last close.
3. **Trading capabilities.** The live `/assets` field is `tradingCapabilities.market | extended | overnight`, each `{ whole, fractional }`. `allDayTradability` from the v4 note is not in the payload. Overnight `TRADING_STATUS_TRADABLE` is stored in `all_day_tradability` and shown as "24/5 reference". On this pull, 194 of 194 assets were overnight-tradable and on chain 4663.
4. **Chainlink feeds.** The docs page renders the table in the client. The machine-readable directory `https://reference-data-directory.vercel.app/feeds-robinhood-mainnet.json` returned 58 feeds. Equity rows use `docs.marketHours` containing `equit` and a `Robinhood {TICKER}` name. An `eth_call` of `latestRoundData` on the NVDA proxy returned a positive answer near the Robinhood NVDA bid. Heartbeat in that file is 86400 seconds. These feeds are Data Feeds (`latestRoundData`), not Data Streams. The directory did not expose a market-status flag. Data Streams pages found during research were xStock streams, not these Robinhood proxies.
5. **Uniswap v3 on 4663.** Factory and QuoterV2 addresses are read from `https://raw.githubusercontent.com/Uniswap/contracts/main/deployments/json/4663.json`. Factory bytecode was present (`eth_getCode` length > 2). v4 PoolManager is in that file and is not indexed. Pool discovery is v3 `getPool` across fee tiers 100, 500, 3000, and 10000 for USDG and WETH only.
6. **USDG and WETH.** Addresses come from https://docs.robinhood.com/chain/contracts. `symbol()` on USDG returned `USDG`. USDG/USD and ETH/USD proxies are in the Chainlink directory. Pools are converted with those feeds. A peg more than 0.5% from 1 is flagged. USDG is not assumed to be $1 when the feed is missing: those pools stay unpriced.
7. **`uiMultiplier()`.** Chainlink documents `uiMultiplier()`, `newUIMultiplier()`, `effectiveAt()`, and `oraclePaused()`. The collector calls them. A revert is isolated to that token.
8. **Corporate actions.** `/rhj/corporate-actions` returns `{ corpActions: [...] }` with `processDate: { year, month, day }`.

## Not verified, and not shown as working

- **Arcus Spot.** No public read path was confirmed against the Spot Router docs in this pass. The card is link-only: `https://app.arcus.xyz/trade/spot/{TICKER}`. It is on the reference lane and has no price, so it cannot enter TVL or the spot spread.
- **Arcus Perps and Lighter.** Not queried. No perp panel is rendered.
- **1inch and Rialto.** No chain-4663 quote call is made. No API key is required to boot. They do not appear as prices.
- **±1% depth.** The figure is an in-range lower bound from current liquidity. It does not walk neighboring ticks. The UI says so. Primary-market ranking uses that figure when it exists, then TVL.
- **Weekend scorecard.** No reopening has been recorded. The UI says "Not enough data yet."
- **20-day volatility.** Thresholds use the documented fallbacks (0.75% while the cash session is open, 2% otherwise) until 20 sessions exist.
- **Watch-address holdings.** Not built. No address is sent to the server except the explicit verify form, which only checks the registry.
- **Webhooks and the SDK package.** Not built.
- **Theme.** One palette: orange `#FF8000`, page `#F4F1E9`, cards `#202320`. There is no theme toggle. `prefers-color-scheme` is not wired.
- **Historical closed-session shading** is a text flag when the stored series contains a `closed` point. The series starts when the collector starts. It is not backfilled.
- **Postgres server.** Local runs use PGlite. `DATABASE_URL` is not read.
- **Colosseum cutoff.** The World's Fair page listed submissions due October 12, 2026. The exact clock time was not copied off that page in this pass.

## Wording

The product does not say a token is backed, that a holder owns the equity, or that a print is the real price. Perps are not shown as Stock Tokens.
