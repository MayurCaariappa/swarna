import {
  addDays,
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  parseISO,
  startOfWeek,
} from "date-fns";
import { futureCycles, naturalPeriods, periodOn, predict } from "./cycle";
import {
  calibrateBleed,
  isPredictedBleedDay,
  packDay,
  toISODate,
  type PackConfig,
} from "./pill";

// What to draw on each calendar day. Shared by her calendar and the partner's.

export interface PeriodLike {
  start_date: string;
  end_date: string | null;
}

export interface TrackingLike {
  mode: "pill" | "natural";
  pack_start_date: string | null;
  active_days: number;
  break_days: number;
  natural_since: string | null;
}

export interface DayInfo<P extends PeriodLike = PeriodLike> {
  date: string;
  inMonth: boolean;
  period?: P;
  predictedBleed: boolean;
  pill?: { number: number; taken: boolean; missed: boolean };
  off?: number;
  fertile: boolean;
  ovulation: boolean;
  logged?: boolean; // has a daily log entry
}

const WEEK = { weekStartsOn: 1 as const }; // Monday first

/** First and last date shown for a month (whole weeks). */
export function monthGrid(month: Date) {
  const start = startOfWeek(month, WEEK);
  const end = endOfWeek(endOfMonth(month), WEEK);
  return { start, end, from: toISODate(start), to: toISODate(end) };
}

/**
 * @param taken  dates with a pill marked taken; pass null to hide pill dots
 *               (e.g. partner without pill sharing)
 */
export function buildMonthDays<P extends PeriodLike>(
  month: Date,
  today: string,
  periods: P[],
  tracking: TrackingLike | null,
  taken: { has(date: string): boolean } | null,
): DayInfo<P>[] {
  const { start, end } = monthGrid(month);

  const cycles =
    tracking?.mode === "natural"
      ? (() => {
          const p = predict(
            naturalPeriods(periods, tracking.natural_since),
            today,
          );
          return p ? futureCycles(p, 6) : [];
        })()
      : [];

  const cfg: PackConfig | null =
    tracking?.mode === "pill" && tracking.pack_start_date
      ? calibrateBleed(
          {
            packStart: tracking.pack_start_date,
            activeDays: tracking.active_days,
            breakDays: tracking.break_days,
          },
          periods,
        )
      : null;

  const out: DayInfo<P>[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const date = toISODate(d);
    const info: DayInfo<P> = {
      date,
      inMonth: d.getMonth() === month.getMonth(),
      predictedBleed: false,
      fertile: false,
      ovulation: false,
      period: periodOn(periods, date, today),
    };
    // Don't predict a bleed right after one that was logged.
    const recentlyLogged = periods.some((p) => {
      const n = differenceInCalendarDays(d, parseISO(p.start_date));
      return n >= 0 && n < 12;
    });
    const mayPredict = !info.period && !recentlyLogged && date >= today;

    if (cfg) {
      const pd = packDay(cfg, d);
      if (pd.kind === "active" && taken) {
        const t = taken.has(date);
        info.pill = { number: pd.number, taken: t, missed: !t && date < today };
      } else if (pd.kind === "off") {
        info.off = pd.number;
        info.predictedBleed = mayPredict && isPredictedBleedDay(cfg, pd);
      }
    }

    for (const c of cycles) {
      if (mayPredict && date >= c.bleedStart && date <= c.bleedEnd)
        info.predictedBleed = true;
      if (date >= c.fertileStart && date <= c.fertileEnd) info.fertile = true;
      if (date === c.ovulation) info.ovulation = true;
    }
    out.push(info);
  }
  return out;
}

/** One wording for a pill's state everywhere: taken / not taken yet / not marked / upcoming. */
export function pillStatus(
  pill: { taken: boolean; missed: boolean },
  date: string,
  today: string,
) {
  if (pill.taken) return "taken";
  if (pill.missed) return "not marked";
  return date === today ? "not taken yet" : "upcoming";
}
