import {
  addDays,
  differenceInCalendarDays,
  format,
  parseISO,
  startOfMonth,
  subMonths,
} from "date-fns";
import type { DailyLogRow, PeriodRow } from "../data/db";
import { cycleLengths } from "./cycle";
import { symptomLabel } from "./dailyLog";
import { packDay, type PackConfig } from "./pill";

// Pure calculations for the Stats screen.

type Period = Pick<PeriodRow, "start_date" | "end_date">;
const days = (a: string, b: string) =>
  differenceInCalendarDays(parseISO(b), parseISO(a));
const mean = (xs: number[]) =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
const round1 = (n: number | null) =>
  n === null ? null : Math.round(n * 10) / 10;

export interface CycleBar {
  start: string;
  length: number; // start → next start
  bleed: number | null; // logged bleed length
}

/** Completed cycles (each period → the next one), newest last, at most `max`. */
export function completedCycles(periods: Period[], max = 12): CycleBar[] {
  const out: CycleBar[] = [];
  for (let i = 0; i < periods.length - 1; i++) {
    const p = periods[i];
    const length = days(p.start_date, periods[i + 1].start_date);
    if (length < 15 || length > 60) continue; // ignore implausible gaps (missed logging)
    out.push({
      start: p.start_date,
      length,
      bleed: p.end_date ? days(p.start_date, p.end_date) + 1 : null,
    });
  }
  return out.slice(-max);
}

export interface Summary {
  avgCycle: number | null;
  avgBleed: number | null;
  shortest: number | null;
  longest: number | null;
  regularity: "regular" | "somewhat" | "irregular" | null;
  variation: number | null; // ± days (standard deviation)
  periodsLogged: number;
}

export function summarize(periods: Period[]): Summary {
  const lengths = cycleLengths(periods).slice(-12);
  const bleeds = periods
    .filter((p) => p.end_date)
    .map((p) => days(p.start_date, p.end_date!) + 1)
    .slice(-12);
  const avg = mean(lengths);
  const sd =
    lengths.length >= 2 && avg !== null
      ? Math.sqrt(mean(lengths.map((x) => (x - avg) ** 2))!)
      : null;
  return {
    avgCycle: round1(avg),
    avgBleed: round1(mean(bleeds)),
    shortest: lengths.length ? Math.min(...lengths) : null,
    longest: lengths.length ? Math.max(...lengths) : null,
    regularity:
      sd === null
        ? null
        : sd <= 2
          ? "regular"
          : sd <= 5
            ? "somewhat"
            : "irregular",
    variation: sd === null ? null : Math.round(sd * 10) / 10,
    periodsLogged: periods.length,
  };
}

/** Day of the cycle for a date (1 = first bleed day), or null before any period. */
function cycleDayOf(starts: string[], date: string): number | null {
  let last: string | null = null;
  for (const s of starts) {
    if (s <= date) last = s;
    else break;
  }
  if (!last) return null;
  const n = days(last, date) + 1;
  return n <= 60 ? n : null;
}

export interface SymptomPattern {
  symptom: string;
  label: string;
  count: number; // logged occurrences with a known cycle day
  from: number | null; // cycle-day window where it usually happens
  to: number | null;
  inWindow: number;
}

/** "Cramps usually on days 1–2": the peak cycle day, widened to neighbours that are at least half as common. */
export function symptomPatterns(
  periods: Period[],
  logs: Pick<DailyLogRow, "date" | "symptoms">[],
): SymptomPattern[] {
  const starts = periods.map((p) => p.start_date);
  const byDay = new Map<string, Map<number, number>>();
  for (const log of logs) {
    const cd = cycleDayOf(starts, log.date);
    if (!cd) continue;
    for (const s of log.symptoms) {
      const m = byDay.get(s) ?? new Map<number, number>();
      m.set(cd, (m.get(cd) ?? 0) + 1);
      byDay.set(s, m);
    }
  }

  const out: SymptomPattern[] = [];
  for (const [symptom, counts] of byDay) {
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    const pattern: SymptomPattern = {
      symptom,
      label: symptomLabel(symptom),
      count: total,
      from: null,
      to: null,
      inWindow: 0,
    };
    if (total >= 3) {
      let peak = 1;
      for (const [d, c] of counts) if (c > (counts.get(peak) ?? 0)) peak = d;
      const max = counts.get(peak)!;
      let from = peak;
      let to = peak;
      while ((counts.get(from - 1) ?? 0) >= max / 2) from--;
      while ((counts.get(to + 1) ?? 0) >= max / 2) to++;
      let inWindow = 0;
      for (let d = from; d <= to; d++) inWindow += counts.get(d) ?? 0;
      // Only call it a pattern if the peak repeats and most occurrences fall in the window.
      if (max >= 2 && inWindow / total >= 0.5)
        Object.assign(pattern, { from, to, inWindow });
    }
    out.push(pattern);
  }
  return out.sort((a, b) => b.count - a.count);
}

export interface MonthRow {
  month: string; // "Nov 2026"
  key: string; // "2026-11"
  loggedDays: number;
  acneDays: number;
  hairDays: number;
  lowMoodDays: number; // low / sad / irritable / anxious
  avgWeight: number | null;
}

/** PCOS-relevant monthly counts, newest month first — from the first month she logged. */
export function monthlyTrends(
  logs: Pick<DailyLogRow, "date" | "symptoms" | "mood" | "weight_kg">[],
  today: string,
  months = 6,
): MonthRow[] {
  const rows: MonthRow[] = [];
  const firstKey = logs.reduce<string | null>(
    (min, l) => (min === null || l.date < min ? l.date : min),
    null,
  )?.slice(0, 7);
  if (!firstKey) return rows;
  for (let i = 0; i < months; i++) {
    const m = subMonths(startOfMonth(parseISO(today)), i);
    const key = format(m, "yyyy-MM");
    if (key < firstKey) break; // no months before she started tracking
    const inMonth = logs.filter((l) => l.date.startsWith(key));
    const weights = inMonth
      .map((l) => l.weight_kg)
      .filter((w): w is number => w != null);
    rows.push({
      month: format(m, "MMM yyyy"),
      key,
      loggedDays: inMonth.length,
      acneDays: inMonth.filter((l) => l.symptoms.includes("acne")).length,
      hairDays: inMonth.filter((l) => l.symptoms.includes("hair_changes"))
        .length,
      lowMoodDays: inMonth.filter(
        (l) =>
          l.mood === "low" ||
          l.mood === "sad" ||
          l.mood === "irritable" ||
          l.mood === "anxious",
      ).length,
      avgWeight: round1(mean(weights)),
    });
  }
  return rows;
}

export function weightSeries(logs: Pick<DailyLogRow, "date" | "weight_kg">[]) {
  return logs
    .filter((l) => l.weight_kg != null)
    .map((l) => ({ date: l.date, kg: Number(l.weight_kg) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export interface PackAdherence {
  packStart: string;
  taken: number;
  due: number; // active days up to today
  current: boolean;
}

/** Pills marked taken per pack (current pack + up to 2 before). */
export function pillAdherence(
  cfg: PackConfig,
  takenDates: Set<string>,
  today: string,
): PackAdherence[] {
  const info = packDay(cfg, parseISO(today));
  if (info.kind === "before") return [];
  const cycle = cfg.activeDays + cfg.breakDays;
  const out: PackAdherence[] = [];
  for (let k = 0; k < 3 && info.packNumber - k >= 0; k++) {
    const start = addDays(info.packStart, -k * cycle);
    let taken = 0;
    let due = 0;
    for (let d = 0; d < cfg.activeDays; d++) {
      const date = format(addDays(start, d), "yyyy-MM-dd");
      if (date > today) break;
      due++;
      if (takenDates.has(date)) taken++;
    }
    out.push({
      packStart: format(start, "yyyy-MM-dd"),
      taken,
      due,
      current: k === 0,
    });
  }
  return out;
}
