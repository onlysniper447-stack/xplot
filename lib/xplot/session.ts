/**
 * Per-token US equity session.
 *
 * The live /rhj/assets payload does not include allDayTradability. It reports
 * tradingCapabilities.market / extended / overnight (verified 2026-10-12).
 * overnight tradable is the 24/5 reference the product calls "24/5 reference".
 * Session source is `overnight_flag` in that case, otherwise `calendar`.
 *
 * Holiday and early-close dates follow the NYSE schedule through 2027.
 * Full-day closures are holidays. Early-close days end the cash session at 13:00 ET.
 */

export type SessionName = "open" | "pre" | "post" | "overnight" | "closed";
export type SessionSource = "overnight_flag" | "calendar";

export type Session = {
  session: SessionName;
  source: SessionSource;
  /** Cash-market label, ignoring the 24/5 flag. Used by the NYSE strip. */
  nyse: "open" | "pre" | "post" | "closed";
};

const TIME_ZONE = "America/New_York";

/** NYSE full closures, YYYY-MM-DD in the New York calendar. */
export const HOLIDAYS: ReadonlySet<string> = new Set([
  "2026-01-01",
  "2026-01-19",
  "2026-02-16",
  "2026-04-03",
  "2026-05-25",
  "2026-06-19",
  "2026-07-03",
  "2026-09-07",
  "2026-11-26",
  "2026-12-25",
  "2027-01-01",
  "2027-01-18",
  "2027-02-15",
  "2027-03-26",
  "2027-05-31",
  "2027-06-18",
  "2027-07-05",
  "2027-09-06",
  "2027-11-25",
  "2027-12-24",
]);

/** Cash session ends 13:00 ET. */
export const EARLY_CLOSE: ReadonlySet<string> = new Set([
  "2026-11-27",
  "2026-12-24",
  "2027-11-26",
]);

export type Zoned = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: string;
  dateKey: string;
  minutes: number;
};

export function zonedParts(date: Date, timeZone = TIME_ZONE): Zoned {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  });
  const parts = fmt.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  let hour = Number(get("hour"));
  if (hour === 24) hour = 0;
  const year = Number(get("year"));
  const month = Number(get("month"));
  const day = Number(get("day"));
  const minute = Number(get("minute"));
  const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return {
    year,
    month,
    day,
    hour,
    minute,
    weekday: get("weekday"),
    dateKey,
    minutes: hour * 60 + minute,
  };
}

function cashSession(z: Zoned): "open" | "pre" | "post" | "closed" {
  if (HOLIDAYS.has(z.dateKey)) return "closed";
  if (z.weekday === "Sat" || z.weekday === "Sun") return "closed";
  const openEnd = EARLY_CLOSE.has(z.dateKey) ? 13 * 60 : 16 * 60;
  if (z.minutes >= 4 * 60 && z.minutes < 9 * 60 + 30) return "pre";
  if (z.minutes >= 9 * 60 + 30 && z.minutes < openEnd) return "open";
  if (z.minutes >= openEnd && z.minutes < 20 * 60) return "post";
  return "closed";
}

/**
 * Chainlink's published 24/5 model treats Fri 20:00 ET through Sun 20:00 ET as the weekend.
 * Sunday 20:00 begins the next overnight session.
 */
function weekendClosed(z: Zoned): boolean {
  if (HOLIDAYS.has(z.dateKey)) return true;
  if (z.weekday === "Sat") return true;
  if (z.weekday === "Sun" && z.minutes < 20 * 60) return true;
  if (z.weekday === "Fri" && z.minutes >= 20 * 60) return true;
  return false;
}

export function resolveSession(now: Date, overnightTradable: boolean): Session {
  const z = zonedParts(now);
  const nyse = cashSession(z);
  if (!overnightTradable) {
    return { session: nyse, source: "calendar", nyse };
  }
  if (weekendClosed(z)) {
    return { session: "closed", source: "overnight_flag", nyse };
  }
  if (nyse === "closed") {
    return { session: "overnight", source: "overnight_flag", nyse };
  }
  return { session: nyse, source: "overnight_flag", nyse };
}

export function sessionLabel(session: SessionName, source: SessionSource): string {
  if (source === "overnight_flag") {
    if (session === "closed") return "Weekend or holiday. 24/5 reference is at the last close.";
    if (session === "overnight") return "Overnight session. 24/5 reference.";
    if (session === "pre") return "Pre-market. 24/5 reference.";
    if (session === "post") return "Post-market. 24/5 reference.";
    return "Regular hours. 24/5 reference.";
  }
  if (session === "open") return "Regular hours, inferred from the calendar.";
  if (session === "pre") return "Pre-market, inferred from the calendar.";
  if (session === "post") return "Post-market, inferred from the calendar.";
  return "Market closed, inferred from the calendar.";
}

function addDays(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d + days));
  return utc.toISOString().slice(0, 10);
}

function weekdayOfKey(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
  }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}

/** Next cash open (09:30 ET) or cash close, as an ET clock label plus a rough countdown. */
export function nyseStrip(now: Date): {
  state: "open" | "pre" | "post" | "closed";
  headline: string;
  detail: string;
} {
  const z = zonedParts(now);
  const state = cashSession(z);
  const openEnd = EARLY_CLOSE.has(z.dateKey) ? "13:00" : "16:00";
  if (state === "open") {
    return { state, headline: "NYSE: OPEN", detail: `closes ${openEnd} ET` };
  }
  if (state === "pre") {
    return { state, headline: "NYSE: PRE-MARKET", detail: "opens 09:30 ET" };
  }
  if (state === "post") {
    return { state, headline: "NYSE: POST-MARKET", detail: "cash session ended" };
  }
  let cursor = z.dateKey;
  if (z.minutes >= 9 * 60 + 30 || z.weekday === "Sat" || z.weekday === "Sun" || HOLIDAYS.has(z.dateKey)) {
    cursor = addDays(cursor, 1);
  }
  for (let i = 0; i < 14; i++) {
    const day = weekdayOfKey(cursor);
    if (day !== "Sat" && day !== "Sun" && !HOLIDAYS.has(cursor)) {
      const [y, m, d] = cursor.split("-").map(Number);
      const label = new Intl.DateTimeFormat("en-US", {
        timeZone: "UTC",
        weekday: "short",
        month: "short",
        day: "numeric",
      }).format(new Date(Date.UTC(y, m - 1, d, 12)));
      return { state, headline: "NYSE: CLOSED", detail: `reopens ${label} 09:30 ET` };
    }
    cursor = addDays(cursor, 1);
  }
  return { state, headline: "NYSE: CLOSED", detail: "reopens 09:30 ET" };
}
