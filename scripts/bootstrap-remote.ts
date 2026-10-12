import { closeDb, getDb, q, redact } from "../lib/db/client";
import { runTick } from "../lib/collector/tick";

const REQUIRED = [
  "equities",
  "instruments",
  "venues",
  "markets",
  "market_snapshots",
  "oracle_snapshots",
  "reference_quotes",
  "corporate_actions",
  "deviations",
  "alerts",
  "weekend_scorecards",
  "coverage_status",
  "coverage_issues",
  "meta",
];

function shape(url: string) {
  try {
    const parsed = new URL(url);
    return {
      postgres: parsed.protocol.startsWith("postgres"),
      neon: parsed.hostname.endsWith("neon.tech"),
      pooler: parsed.hostname.includes("-pooler"),
      ssl: parsed.searchParams.has("sslmode"),
    };
  } catch {
    return { postgres: url.startsWith("postgres"), neon: url.includes("neon.tech"), pooler: url.includes("pooler"), ssl: url.includes("sslmode=") };
  }
}

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url || url.includes("SENSITIVE")) {
    console.log("bootstrap: DATABASE_URL is not set. Local PGlite is unchanged.");
    return;
  }
  console.log(`bootstrap: remote ${JSON.stringify(shape(url))}`);
  await getDb();
  const tables = await q<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
  );
  const names = tables.map((row) => row.table_name);
  const missing = REQUIRED.filter((name) => !names.includes(name));
  console.log(`bootstrap: tables ${names.join(", ")}`);
  if (missing.length > 0) {
    throw new Error(`missing tables: ${missing.join(", ")}`);
  }
  const before = await q<{ n: string }>(`SELECT count(*)::text AS n FROM equities`);
  const equityCount = Number(before[0]?.n ?? 0);
  console.log(`bootstrap: equities before ${equityCount}`);
  if (equityCount === 0) {
    const result = await runTick();
    console.log(`bootstrap: collector ${result.log}`);
  } else {
    console.log("bootstrap: equities already stored, collector not started");
  }
  const after = await q<{ equities: string; instruments: string; meta: string }>(
    `SELECT
       (SELECT count(*)::text FROM equities) AS equities,
       (SELECT count(*)::text FROM instruments) AS instruments,
       (SELECT count(*)::text FROM meta) AS meta`,
  );
  console.log(`bootstrap: counts ${JSON.stringify(after[0] ?? null)}`);
}

main()
  .catch((error: unknown) => {
    console.error(`bootstrap: ${redact(error)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });
