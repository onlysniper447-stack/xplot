# XPLOT

The truth layer for 24/7 stock tokens on Robinhood Chain.

XPLOT keeps one canonical profile per equity (`EQ:US:NVDA`), separates the last-close oracle from pool price discovery, and reports an honest coverage tier for every Robinhood Stock Token. It is read-only. It does not connect a wallet or submit a transaction.

Robinhood Stock Tokens are issuer debt securities that provide economic exposure only. They do not confer ownership.

## Setup

```bash
npm install
npm run collector
npm run dev
```

Open http://localhost:3000.

`npm run collector` is the writer. It ticks every 60 seconds. `npm run dev` embeds another tick unless `XPLOT_EMBED_COLLECTOR=0`. Do not run both writers at once. They share one local Postgres database (PGlite) in `.data/xplot`.

There is no Postgres server on this machine, so local development uses PGlite, which speaks Postgres SQL and applies `db/schema.sql`. Set nothing else to boot.

| Variable | Purpose |
| --- | --- |
| `ROBINHOOD_RPC_URL` | Public RPC. Defaults to `https://rpc.mainnet.chain.robinhood.com` |
| `XPLOT_DATA_DIR` | Database directory |
| `XPLOT_EMBED_COLLECTOR` | `0` disables the tick inside `next dev` |
| `ONEINCH_API_KEY` | Unused until a 1inch read path is verified |
| `RIALTO_API_KEY` | Unused until a Rialto read path is verified |

## Universe

The collector loads `GET https://api.robinhood.com/rhj/assets` and keeps deployments whose `chainId` is 4663. Feed proxies come from Chainlink's Robinhood feed directory at request time. Uniswap v3 factory and QuoterV2 addresses come from `Uniswap/contracts` `deployments/json/4663.json`, then `eth_getCode` must succeed.

Re-sync by running the collector again. Delisted assets are marked, not deleted.

## Checks

```bash
npm test
npm run check:readonly
```

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Market strip, alerts, equity table |
| `/e/[ticker]` | Canonical card |
| `/coverage` | Tier for every listed token |
| `/verify` | Address check |
| `/api` | API index |
| `/v1/*` | JSON API, database reads only |

The product is Robinhood Chain only. There is no Solana client, no Jupiter quote path, and no Tessera catalogue.

## Docs

- `docs/AUDIT.md`
- `docs/COVERAGE_REPORT.md` (written by a collector run)
- `docs/KNOWN_LIMITATIONS.md`
- `docs/DEMO.md`

