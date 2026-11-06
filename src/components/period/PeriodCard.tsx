import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { Droplet } from "lucide-react";
import { useState } from "react";
import { endPeriod, startPeriod } from "../../data/actions";
import type { PeriodRow } from "../../data/db";
import { MAX_OPEN_BLEED, periodOn } from "../../lib/cycle";
import PeriodEditor from "./PeriodEditor";

/** Today tile: one tap "Started today" / "Ended today", plus date editing. */
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
      <section className="card stack span-2">
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
    <>
      <section className="tile blk-rose" aria-label="Period">
        <div className="tile-icon">
          <Droplet size={18} />
        </div>
        <p className="tile-label">Period</p>
        <p className="tile-value">{ongoing ? `Day ${day}` : "Not now"}</p>
        <div className="tile-actions">
          {ongoing ? (
            ongoing.end_date === today ? (
              <p className="tile-note">Ends today ✓</p>
            ) : (
              <button
                className="btn ink sm"
                onClick={() => endPeriod(ongoing, today)}
              >
                It ended
              </button>
            )
          ) : (
            <button
              className="btn ink sm"
              onClick={() => startPeriod(ownerId, today)}
            >
              It started
            </button>
          )}
          <button
            className="btn link xs"
            onClick={() => setEditing(ongoing ?? "new")}
          >
            {ongoing ? "Change dates" : "Another day"}
          </button>
        </div>
      </section>

      {stale && (
        <section className="card warn span-2 row-between small">
          <span>
            Your period from {format(parseISO(stale.start_date), "d MMM")} has
            no end date.
          </span>
          <button className="btn ink sm" onClick={() => setEditing(stale)}>
            Set end
          </button>
        </section>
      )}
    </>
  );
}
