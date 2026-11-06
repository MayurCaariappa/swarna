import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import type { ReactNode } from "react";
import type { PeriodRow, TrackingRow } from "../../data/db";
import { cycleDay, naturalPeriods, periodOn, predict } from "../../lib/cycle";
import { toISODate } from "../../lib/pill";
import PackBars, { type BarState } from "../ui/PackBars";

const d = (iso: string) => format(parseISO(iso), "d MMM");

const REGULARITY: Record<string, string> = {
  regular: "Regular",
  somewhat: "Fairly regular",
  irregular: "Irregular",
  unknown: "Learning your cycle",
};

/** Natural-cycle hero: cycle day, bars through the cycle, next period. Then `children` (tiles). */
export default function NaturalToday({
  tracking,
  periods,
  today,
  children,
}: {
  tracking: TrackingRow;
  periods: PeriodRow[];
  today: string;
  children?: ReactNode;
}) {
  const natural = naturalPeriods(periods, tracking.natural_since);
  const p = predict(natural, today);
  const inPeriod = periodOn(periods, today, today);
  const recentlyStopped =
    tracking.natural_since &&
    differenceInCalendarDays(
      parseISO(today),
      parseISO(tracking.natural_since),
    ) < 120;

  if (!p) {
    return (
      <>
        <section className="blk blk-lilac" aria-label="Cycle today">
          <span className="blk-chip">Natural cycle</span>
          <span className="blk-title">Log your period to begin</span>
          <p className="blk-line">
            Predictions appear after your first period and improve every cycle.
          </p>
          {recentlyStopped && (
            <p className="blk-line">
              The first cycles after stopping the pill can be irregular.
            </p>
          )}
        </section>
        {children}
      </>
    );
  }

  const until = differenceInCalendarDays(
    parseISO(p.nextStart),
    parseISO(today),
  );
  const cd = cycleDay(natural, today) ?? 0;
  const fertileNow = today >= p.fertileStart && today <= p.fertileEnd;

  // One bar per day of this cycle (up to 45).
  const length = Math.min(Math.max(p.avgCycle, cd), 45);
  const bars: BarState[] = Array.from({ length }, (_, i) => {
    const date = toISODate(addDays(parseISO(p.lastStart), i));
    if (date === today) return "now";
    if (periodOn(periods, date, today)) return "bleed";
    if (date >= p.fertileStart && date <= p.fertileEnd) return "fert";
    return date < today ? "done" : "todo";
  });

  return (
    <>
      <section className="blk blk-lilac">
        <div className="blk-head">
          <span className={`blk-chip ${inPeriod ? "bleed" : ""}`}>
            {inPeriod
              ? "On your period"
              : fertileNow
                ? "Fertile window"
                : "Natural cycle"}
          </span>
          <span className="blk-line">{REGULARITY[p.regularity]}</span>
        </div>

        <div className="big-row">
          <span className="big-num">Day {cd || "–"}</span>
          <span className="soft-ink" style={{ fontWeight: 700 }}>
            of ~{p.avgCycle}
          </span>
        </div>

        <PackBars
          bars={bars}
          label={`Cycle day ${cd} of about ${p.avgCycle}`}
        />

        <p className="blk-line">
          {inPeriod
            ? `Next period ~${d(p.nextStart)}`
            : p.daysLate > 0
              ? `${p.daysLate} day${p.daysLate === 1 ? "" : "s"} later than predicted`
              : until === 0
                ? "Period expected today"
                : `Period in ${until} day${until === 1 ? "" : "s"}`}
          {" · "}
          {fertileNow
            ? `ovulation ~${d(p.ovulation)}`
            : today < p.fertileStart
              ? `fertile ${d(p.fertileStart)}–${d(p.fertileEnd)}`
              : `${p.confidence} confidence`}
        </p>
        {recentlyStopped && (
          <p className="blk-line">
            The first cycles after stopping the pill can be irregular.
          </p>
        )}
      </section>
      {children}
    </>
  );
}
