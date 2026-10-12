-- XPLOT schema. Postgres dialect. Applied with IF NOT EXISTS so a tick can boot safely.

CREATE TABLE IF NOT EXISTS equities (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  name TEXT NOT NULL,
  asset_class TEXT NOT NULL CHECK (asset_class IN ('stock','etf')),
  exchange TEXT
);

CREATE TABLE IF NOT EXISTS instruments (
  id SERIAL PRIMARY KEY,
  asset_id TEXT UNIQUE NOT NULL,
  equity_id TEXT REFERENCES equities(id),
  chain_id INT NOT NULL DEFAULT 4663,
  address TEXT NOT NULL,
  symbol TEXT NOT NULL,
  decimals INT NOT NULL,
  instrument_type TEXT NOT NULL DEFAULT 'issuer_note',
  status TEXT,
  current_multiplier NUMERIC,
  pending_multiplier NUMERIC,
  pending_effective_at TIMESTAMPTZ,
  all_day_tradability TEXT,
  fractional_tradability TEXT,
  chainlink_feed TEXT,
  feed_decimals INT,
  feed_heartbeat_s INT,
  rialto_supported BOOLEAN,
  delisted_at TIMESTAMPTZ,
  logo_url TEXT,
  isin TEXT,
  onchain_symbol TEXT,
  onchain_name TEXT,
  onchain_decimals INT,
  ui_multiplier NUMERIC,
  oracle_paused BOOLEAN,
  UNIQUE (chain_id, address)
);

CREATE TABLE IF NOT EXISTS venues (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('amm','orderbook','router','aggregator','perp')),
  lane TEXT NOT NULL CHECK (lane IN ('spot','reference','derivatives')),
  url TEXT,
  read_path TEXT
);

CREATE TABLE IF NOT EXISTS markets (
  id SERIAL PRIMARY KEY,
  venue_id TEXT REFERENCES venues(id),
  instrument_id INT REFERENCES instruments(id),
  quote_symbol TEXT,
  quote_address TEXT,
  pool_address TEXT,
  external_symbol TEXT,
  fee_bps INT,
  deeplink_url TEXT,
  UNIQUE (venue_id, instrument_id, quote_symbol, pool_address)
);

CREATE TABLE IF NOT EXISTS market_snapshots (
  market_id INT REFERENCES markets(id),
  ts TIMESTAMPTZ NOT NULL,
  price_usd_per_token NUMERIC,
  tvl_usd NUMERIC,
  volume_24h_usd NUMERIC,
  depth_1pct_usd NUMERIC,
  impact_1k_bps NUMERIC,
  impact_10k_bps NUMERIC,
  impact_50k_bps NUMERIC,
  fee_apy_7d NUMERIC,
  extra JSONB,
  PRIMARY KEY (market_id, ts)
);

CREATE TABLE IF NOT EXISTS oracle_snapshots (
  instrument_id INT REFERENCES instruments(id),
  ts TIMESTAMPTZ NOT NULL,
  price NUMERIC NOT NULL,
  oracle_updated_at TIMESTAMPTZ NOT NULL,
  age_s INT NOT NULL,
  oracle_state TEXT NOT NULL,
  PRIMARY KEY (instrument_id, ts)
);

CREATE TABLE IF NOT EXISTS reference_quotes (
  instrument_id INT REFERENCES instruments(id),
  ts TIMESTAMPTZ NOT NULL,
  bid NUMERIC,
  ask NUMERIC,
  is_trading_halt BOOLEAN,
  generated_at TIMESTAMPTZ,
  oracle_vs_reference_pct NUMERIC,
  daily_volume NUMERIC,
  PRIMARY KEY (instrument_id, ts)
);

CREATE TABLE IF NOT EXISTS corporate_actions (
  id TEXT PRIMARY KEY,
  instrument_id INT REFERENCES instruments(id),
  type TEXT,
  status TEXT,
  process_date DATE,
  details JSONB
);

CREATE TABLE IF NOT EXISTS deviations (
  instrument_id INT REFERENCES instruments(id),
  ts TIMESTAMPTZ NOT NULL,
  dex_price NUMERIC,
  oracle_price NUMERIC,
  oracle_age_s INT,
  spread_pct NUMERIC,
  executable_spread_1k_pct NUMERIC,
  session TEXT NOT NULL,
  session_source TEXT NOT NULL,
  oracle_state TEXT NOT NULL,
  liquidity_confidence TEXT,
  venue_dispersion_pct NUMERIC,
  alert TEXT,
  underlying_price NUMERIC,
  threshold_pct NUMERIC,
  PRIMARY KEY (instrument_id, ts)
);

CREATE TABLE IF NOT EXISTS alerts (
  id SERIAL PRIMARY KEY,
  instrument_id INT REFERENCES instruments(id),
  kind TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL,
  peak_spread_pct NUMERIC,
  resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS weekend_scorecards (
  instrument_id INT REFERENCES instruments(id),
  reopened_at TIMESTAMPTZ NOT NULL,
  dex_price_pre_open NUMERIC,
  last_close NUMERIC,
  open_price NUMERIC,
  gap_predicted_pct NUMERIC,
  gap_actual_pct NUMERIC,
  error_pct NUMERIC,
  PRIMARY KEY (instrument_id, reopened_at)
);

CREATE TABLE IF NOT EXISTS coverage_status (
  instrument_id INT REFERENCES instruments(id),
  ts TIMESTAMPTZ NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('FULL','ORACLE_ONLY','DEX_ONLY','LISTED_ONLY','DEGRADED')),
  feed_status TEXT NOT NULL,
  pool_count INT NOT NULL,
  reasons TEXT[] NOT NULL DEFAULT '{}',
  PRIMARY KEY (instrument_id, ts)
);

CREATE TABLE IF NOT EXISTS coverage_issues (
  id SERIAL PRIMARY KEY,
  instrument_id INT REFERENCES instruments(id),
  code TEXT NOT NULL,
  detail TEXT,
  first_seen TIMESTAMPTZ DEFAULT now(),
  last_seen TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS deviations_instrument_ts ON deviations (instrument_id, ts DESC);
CREATE INDEX IF NOT EXISTS oracle_snapshots_instrument_ts ON oracle_snapshots (instrument_id, ts DESC);
CREATE INDEX IF NOT EXISTS market_snapshots_market_ts ON market_snapshots (market_id, ts DESC);
CREATE INDEX IF NOT EXISTS alerts_open ON alerts (instrument_id) WHERE resolved_at IS NULL;
