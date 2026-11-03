// Pack-schedule maths for the server. Mirrors src/lib/pill.ts (keep in sync).
// Dates are "yyyy-mm-dd" strings in her local calendar.

const DAY = 86_400_000;
const utc = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};

export const daysBetween = (from: string, to: string) =>
  Math.round((utc(to) - utc(from)) / DAY);
export const addDays = (iso: string, n: number) =>
  new Date(utc(iso) + n * DAY).toISOString().slice(0, 10);

export const BLEED_START_OFFSET = 2;

export interface PackDay {
  kind: "before" | "active" | "off";
  number: number;
}

export function packDay(
  packStart: string,
  active: number,
  brk: number,
  date: string,
): PackDay {
  const since = daysBetween(packStart, date);
  if (since < 0) return { kind: "before", number: 0 };
  const dayInPack = since % (active + brk);
  return dayInPack < active
    ? { kind: "active", number: dayInPack + 1 }
    : { kind: "off", number: dayInPack - active + 1 };
}

/** First expected bleed day is this off-day number (1-based), or null if no break. */
export function bleedStartOffDay(brk: number): number | null {
  if (brk === 0) return null;
  return Math.min(BLEED_START_OFFSET, brk - 1) + 1;
}

/** Current date and minutes-since-midnight in an IANA timezone. */
export function localNow(timeZone: string, at = new Date()) {
  let tz = timeZone;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz });
  } catch {
    tz = "UTC";
  }
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

export const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/**
 * Her usual bleed start as a 1-based off-day number, learned from bleeds logged
 * around breaks (last 6, need ≥ 2). Mirrors calibrateBleed in src/lib/pill.ts.
 */
export function calibratedBleedOffDay(
  packStart: string,
  active: number,
  brk: number,
  periods: { start_date: string }[],
): number | null {
  const fallback = bleedStartOffDay(brk);
  if (fallback === null) return null;
  const offsets: number[] = [];
  for (const p of periods) {
    const pd = packDay(packStart, active, brk, p.start_date);
    if (pd.kind === "off") offsets.push(pd.number - 1);
    else if (pd.kind === "active" && pd.number > active - 3) offsets.push(0);
  }
  if (offsets.length < 2) return fallback;
  const s = offsets.slice(-6).sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  const median = s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
  return Math.min(median, brk - 1) + 1;
}
