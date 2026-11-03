import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { useState } from "react";
import { endPeriod, startPeriod } from "../../data/actions";
import type { PeriodRow } from "../../data/db";
import { MAX_OPEN_BLEED, periodOn } from "../../lib/cycle";
import PeriodEditor from "./PeriodEditor";

/** Today: one-tap "Period started" / "Period ended". */
export default function PeriodCard({
  ownerId,
  periods,
  today,
}: {
  ownerId: string;
  periods: PeriodRow[];
  today: string;
}) {
  const [editing, setEditing] = useState<PeriodRow | "new" | null>(null);

  const current = periodOn(periods, today, today);
  const ongoing =
    current && (current.end_date === null || current.end_date >= today)
      ? current
      : undefined;
  // An old period that was never ended.
  const stale = periods.find(
    (p) =>
      p.end_date === null &&
      differenceInCalendarDays(parseISO(today), parseISO(p.start_date)) >=
        MAX_OPEN_BLEED,
  );
  const day = ongoing
    ? differenceInCalendarDays(parseISO(today), parseISO(ongoing.start_date)) +
      1
    : 0;

  if (editing) {
    return (
      <section className="card stack">
        <h2>{editing === "new" ? "Log a period" : "Edit period"}</h2>
        <PeriodEditor
          ownerId={ownerId}
          period={editing === "new" ? null : editing}
          all={periods}
          today={today}
          onDone={() => setEditing(null)}
        />
      </section>
    );
  }

  return (
    <section className="card stack period-card">
      {ongoing ? (
        <>
          <div>
            <p className="muted small">Period</p>
            <p className="period-day">Day {day}</p>
          </div>
          {ongoing.end_date === today ? (
            <p className="muted small">Ends today ✓</p>
          ) : (
            <button
              className="btn bleed"
              onClick={() => endPeriod(ongoing, today)}
            >
              Period ended today
            </button>
          )}
          <button className="btn link" onClick={() => setEditing(ongoing)}>
            Change dates
          </button>
        </>
      ) : (
        <>
          <button
            className="btn bleed"
            onClick={() => startPeriod(ownerId, today)}
          >
            Period started today
          </button>
          <button className="btn link" onClick={() => setEditing("new")}>
            Started another day?
          </button>
        </>
      )}

      {stale && (
        <div className="card warn small stack">
          <span>
            Your period from {format(parseISO(stale.start_date), "d MMM")} has
            no end date. When did it end?
          </span>
          <button className="btn" onClick={() => setEditing(stale)}>
            Set end date
          </button>
        </div>
      )}
    </section>
  );
}
