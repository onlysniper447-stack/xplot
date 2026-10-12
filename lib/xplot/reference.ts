import { z } from "zod";

const PRICES_URL = "https://api.robinhood.com/rhj/prices";
const CACHE_MS = 15_000;
const MAX_PER_SECOND = 60;

const QuoteSchema = z.object({
  bid: z.string(),
  ask: z.string(),
  currency: z.string(),
  dailyTradingVolume: z.string().optional(),
  isTradingHalt: z.boolean(),
  generatedAt: z.string(),
});

const PriceSchema = z.union([z.object({ quotes: z.array(QuoteSchema) }), QuoteSchema]);

export type RhQuote = z.infer<typeof QuoteSchema>;

const cache = new Map<string, { at: number; quote: RhQuote | null }>();
let gate: Promise<void> = Promise.resolve();
const sentAt: number[] = [];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** At most 60 requests in any rolling second. Cache hits do not take a slot. */
function takeSlot(): Promise<void> {
  const run = gate.then(async () => {
    for (;;) {
      const now = Date.now();
      while (sentAt.length && now - sentAt[0] >= 1000) sentAt.shift();
      if (sentAt.length < MAX_PER_SECOND) {
        sentAt.push(now);
        return;
      }
      await sleep(1000 - (now - sentAt[0]) + 5);
    }
  });
  gate = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function fetchQuote(symbol: string): Promise<RhQuote | null> {
  let lastStatus = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    await takeSlot();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8_000);
    try {
      const res = await fetch(`${PRICES_URL}/${encodeURIComponent(symbol)}`, {
        signal: ctrl.signal,
        headers: { accept: "application/json", "user-agent": "xplot/0.1 (read-only)" },
      });
      lastStatus = res.status;
      if (res.status === 429) {
        await sleep(1_500 * 2 ** attempt);
        continue;
      }
      if (!res.ok) return null;
      const body = PriceSchema.parse(await res.json());
      return "quotes" in body ? body.quotes[0] ?? null : body;
    } catch {
      if (lastStatus === 429) continue;
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

/** Robinhood /rhj/prices/{symbol}. Cached for 15 seconds. Not an on-chain price. */
export async function robinhoodQuote(symbol: string): Promise<RhQuote | null> {
  const key = symbol.toUpperCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.quote;
  const quote = await fetchQuote(key);
  cache.set(key, { at: Date.now(), quote });
  return quote;
}

export function referenceMid(quote: RhQuote | null): number | null {
  if (!quote) return null;
  const bid = Number(quote.bid);
  const ask = Number(quote.ask);
  if (!Number.isFinite(bid) || !Number.isFinite(ask)) return null;
  return (bid + ask) / 2;
}
