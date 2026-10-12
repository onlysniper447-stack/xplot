import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

type Sql = PGlite;

const globalForDb = globalThis as unknown as { xplotDb?: Promise<Sql> };

export function databasePath(): string {
  return process.env.XPLOT_DATA_DIR || path.join(process.cwd(), ".data", "xplot");
}

export async function getDb(): Promise<Sql> {
  if (!globalForDb.xplotDb) {
    globalForDb.xplotDb = openDb();
  }
  return globalForDb.xplotDb;
}

async function openDb(): Promise<Sql> {
  const dir = databasePath();
  fs.mkdirSync(dir, { recursive: true });
  const db = new PGlite(dir);
  await db.waitReady;
  const schema = fs.readFileSync(path.join(process.cwd(), "db", "schema.sql"), "utf8");
  await db.exec(schema);
  return db;
}

export async function q<T extends Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const db = await getDb();
  const result = await db.query<T>(text, params);
  return result.rows;
}

export async function one<T extends Record<string, unknown>>(
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
