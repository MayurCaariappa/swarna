import { addDays, differenceInCalendarDays, parseISO } from "date-fns";
import type { PeriodRow } from "../data/db";
import { toISODate } from "./pill";

// Natural-cycle maths. Mirrored on the server in supabase/functions/_shared/cycle.ts.

export const DEFAULT_CYCLE = 28;
export const DEFAULT_BLEED = 5;
export const MAX_OPEN_BLEED = 14; // an un-ended period stops being drawn after this many days
const MIN_CYCLE = 15;
const MAX_CYCLE = 60;
const RECENT = 6; // cycles used for the average

type Period = Pick<PeriodRow, "start_date" | "end_date">;

const days = (a: string, b: string) =>
  differenceInCalendarDays(parseISO(b), parseISO(a));

/** Last day of a period for display: its end, or (if still open) today, capped. */
export function periodEnd(p: Period, today: string): string {
  // An end date after today (saved by an older version) only counts up to today.
  if (p.end_date) return p.end_date > today && p.start_date <= today ? today : p.end_date;
  const cap = toISODate(addDays(parseISO(p.start_date), MAX_OPEN_BLEED - 1));
  return today < cap ? today : cap;
}

/** The period covering `date`, if any. */
export function periodOn<T extends Period>(
  periods: T[],
  date: string,
  today: string,
): T | undefined {
  return periods.find(
    (p) => p.start_date <= date && date <= periodEnd(p, today),
  );
}

/** Cycle lengths (start → next start), oldest first, ignoring implausible gaps. */
export function cycleLengths(periods: Period[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < periods.length; i++) {
    const n = days(periods[i - 1].start_date, periods[i].start_date);
    if (n >= MIN_CYCLE && n <= MAX_CYCLE) out.push(n);
  }
  return out;
}

/** Recent values count more: weights 1, 2, 3 … for oldest → newest. */
function weightedAverage(values: number[]): number {
  const recent = values.slice(-RECENT);
  let sum = 0;
  let weight = 0;
  recent.forEach((v, i) => {
    sum += v * (i + 1);
    weight += i + 1;
  });
  return sum / weight;
}

function stdev(values: number[]): number {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(
    values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length,
  );
}

export type Regularity = "regular" | "somewhat" | "irregular" | "unknown";
export type Confidence = "low" | "medium" | "high";

export interface Prediction {
  avgCycle: number;
  avgBleed: number;
  cycleCount: number;
  lastStart: string;
  nextStart: string;
  nextEnd: string;
  ovulation: string;
  fertileStart: string;
  fertileEnd: string;
  regularity: Regularity;
  confidence: Confidence;
  /** Days past the predicted start with no new period logged (0 if not late). */
  daysLate: number;
}

/** Periods that count for natural-cycle predictions (not pill withdrawal bleeds). */
export function naturalPeriods<T extends Period>(
  periods: T[],
  naturalSince: string | null,
): T[] {
  return naturalSince
    ? periods.filter((p) => p.start_date >= naturalSince)
    : periods;
}

export function predict(periods: Period[], today: string): Prediction | null {
  if (periods.length === 0) return null;
  const lengths = cycleLengths(periods);
  const avgCycle = lengths.length
    ? Math.round(weightedAverage(lengths))
    : DEFAULT_CYCLE;

  const bleeds = periods
    .filter((p) => p.end_date)
    .map((p) => days(p.start_date, p.end_date!) + 1);
  const avgBleed = bleeds.length
    ? Math.round(weightedAverage(bleeds))
    : DEFAULT_BLEED;

  const lastStart = periods[periods.length - 1].start_date;
  const next = addDays(parseISO(lastStart), avgCycle);
  const ovulation = addDays(next, -14);

  const sd = lengths.length >= 2 ? stdev(lengths.slice(-RECENT)) : null;
  const regularity: Regularity =
    sd === null
      ? "unknown"
      : sd <= 2
        ? "regular"
        : sd <= 5
          ? "somewhat"
          : "irregular";

  let level = lengths.length >= 6 ? 2 : lengths.length >= 3 ? 1 : 0;
  if (regularity === "irregular") level = Math.max(level - 1, 0);
  const confidence: Confidence = (["low", "medium", "high"] as const)[level];

  const nextStart = toISODate(next);
  return {
    avgCycle,
    avgBleed,
    cycleCount: lengths.length,
    lastStart,
    nextStart,
    nextEnd: toISODate(addDays(next, avgBleed - 1)),
    ovulation: toISODate(ovulation),
    fertileStart: toISODate(addDays(ovulation, -5)),
    fertileEnd: toISODate(addDays(ovulation, 1)),
    regularity,
    confidence,
    daysLate: Math.max(days(nextStart, today), 0),
  };
}

export interface PredictedCycle {
  bleedStart: string;
  bleedEnd: string;
  ovulation: string;
  fertileStart: string;
  fertileEnd: string;
}

/** The next `count` predicted cycles, for the calendar. */
export function futureCycles(p: Prediction, count = 4): PredictedCycle[] {
  const out: PredictedCycle[] = [];
  for (let k = 0; k < count; k++) {
    const start = addDays(parseISO(p.nextStart), k * p.avgCycle);
    const ov = addDays(start, -14);
    out.push({
      bleedStart: toISODate(start),
      bleedEnd: toISODate(addDays(start, p.avgBleed - 1)),
      ovulation: toISODate(ov),
      fertileStart: toISODate(addDays(ov, -5)),
      fertileEnd: toISODate(addDays(ov, 1)),
    });
  }
  return out;
}

/** Cycle day (1 = first day of the latest period on or before `date`). */
export function cycleDay(periods: Period[], date: string): number | null {
  const last = [...periods].reverse().find((p) => p.start_date <= date);
  return last ? days(last.start_date, date) + 1 : null;
}
