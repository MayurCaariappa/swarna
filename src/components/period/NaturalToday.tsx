import { differenceInCalendarDays, format, parseISO } from "date-fns";
import type { PeriodRow, TrackingRow } from "../../data/db";
import { cycleDay, naturalPeriods, periodOn, predict } from "../../lib/cycle";

const d = (iso: string) => format(parseISO(iso), "EEE d MMM");

const REGULARITY: Record<string, string> = {
  regular: "Regular cycles",
  somewhat: "Fairly regular",
  irregular: "Irregular cycles",
  unknown: "Regularity: needs 3+ cycles",
};

/** Today hero for natural-cycle mode: cycle day, next period, fertile window. */
export default function NaturalToday({
  tracking,
  periods,
  today,
}: {
  tracking: TrackingRow;
  periods: PeriodRow[];
  today: string;
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
      <section className="card hero">
        <p className="muted">Natural cycle</p>
        <p className="hero-text">Log your period to begin</p>
        <p className="muted small">
          Predictions appear after your first logged period and improve with
          every cycle.
        </p>
        {recentlyStopped && (
          <p className="muted small">
            The first cycles after stopping the pill can be irregular.
          </p>
        )}
      </section>
    );
  }

  const until = differenceInCalendarDays(
    parseISO(p.nextStart),
    parseISO(today),
  );
  const cd = cycleDay(natural, today);
  const fertileNow = today >= p.fertileStart && today <= p.fertileEnd;

  return (
    <section className="card hero">
      <p className="muted">Natural cycle{cd ? ` · day ${cd}` : ""}</p>
      <p className="hero-text">
        {inPeriod
          ? "On your period"
          : p.daysLate > 0
            ? `Period ${p.daysLate} day${p.daysLate === 1 ? "" : "s"} late`
            : until === 0
              ? "Period expected today"
              : `Period in ${until} day${until === 1 ? "" : "s"}`}
      </p>
      {!inPeriod && <p className="muted">Expected around {d(p.nextStart)}</p>}
      <p className="muted small">
        {fertileNow
          ? `Fertile window now · ovulation around ${d(p.ovulation)}`
          : today < p.fertileStart
            ? `Fertile window ${d(p.fertileStart)}–${d(p.fertileEnd)}`
            : `Ovulation estimated ${d(p.ovulation)}`}
      </p>
      <div className="chips">
        <span className="chip">{REGULARITY[p.regularity]}</span>
        <span className="chip">Confidence: {p.confidence}</span>
        <span className="chip">Avg cycle {p.avgCycle} d</span>
      </div>
      {recentlyStopped && (
        <p className="muted small">
          The first cycles after stopping the pill can be irregular.
        </p>
      )}
    </section>
  );
}
