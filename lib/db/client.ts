import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { Pool, type QueryResultRow } from "pg";

type Queryable = {
  query<T extends QueryResultRow>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
};

const globalForDb = globalThis as unknown as { xplotDb?: Promise<Queryable>; xplotPool?: Pool };

export function databasePath(): string {
  return process.env.XPLOT_DATA_DIR || path.join(process.cwd(), ".data", "xplot");
}

export function usesRemoteDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export async function getDb(): Promise<Queryable> {
  if (!globalForDb.xplotDb) {
    globalForDb.xplotDb = openDb();
  }
  return globalForDb.xplotDb;
}

function schemaText(): string {
  return fs.readFileSync(path.join(process.cwd(), "db", "schema.sql"), "utf8");
}

/** Statements from db/schema.sql. Every one is IF NOT EXISTS. None drop or rewrite rows. */
export function schemaStatements(): string[] {
  return schemaText()
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.replace(/--[^\n]*/g, "").trim().length > 0);
}

async function openDb(): Promise<Queryable> {
  const url = process.env.DATABASE_URL;
  if (url) return openPostgres(url);
  return openPglite();
}

async function openPglite(): Promise<Queryable> {
  const dir = databasePath();
  fs.mkdirSync(dir, { recursive: true });
  const db = new PGlite(dir);
  await db.waitReady;
  await db.exec(schemaText());
  return db;
}

async function openPostgres(connectionString: string): Promise<Queryable> {
  const pool = new Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 15_000,
  });
  globalForDb.xplotPool = pool;
  pool.on("error", (error) => {
    console.error(`postgres pool: ${redact(error)}`);
  });
  const db: Queryable = {
    query: (text, params) => pool.query(text, params as never[]),
  };
  for (const statement of schemaStatements()) {
    await db.query(statement);
  }
  return db;
}

export async function closeDb(): Promise<void> {
  const pool = globalForDb.xplotPool;
  globalForDb.xplotPool = undefined;
  globalForDb.xplotDb = undefined;
  if (pool) await pool.end();
}

export function redact(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "failed");
  return message.replace(/postgres(?:ql)?:\/\/\S+/gi, "postgresql://***").replace(/\s+/g, " ").slice(0, 300);
}

export async function q<T extends QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const db = await getDb();
  const result = await db.query<T>(text, params);
  return result.rows;
}

export async function one<T extends QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await q<T>(text, params);
  return rows[0] ?? null;
}

export function num(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function asTextArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  return [];
}
