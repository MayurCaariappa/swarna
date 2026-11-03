import {
  differenceInCalendarDays,
  format,
  parseISO,
  startOfMonth,
} from "date-fns";
import { useMemo, useState } from "react";
import CalendarGrid from "../../components/calendar/CalendarGrid";
import Disclaimer from "../../components/Disclaimer";
import { buildMonthDays } from "../../lib/calendarDays";
import { usePartnerData } from "../../partner/PartnerData";

/** Read-only shared calendar. */
export default function PartnerCalendar() {
  const { ownerName, sharing, tracking, periods, takenDates, today } =
    usePartnerData();
  const [month, setMonth] = useState(() => startOfMonth(parseISO(today)));
  const [selected, setSelected] = useState(today);

  const showPeriods = sharing?.share_periods ?? false;
  const showPills = sharing?.share_pill_status ?? false;
  const taken = useMemo(() => new Set(takenDates), [takenDates]);

  const days = useMemo(
    () =>
      buildMonthDays(
        month,
        today,
        showPeriods ? periods : [],
        tracking,
        showPills ? taken : null,
      ),
    [month, today, periods, tracking, taken, showPeriods, showPills],
  );

  if (!showPeriods && !showPills) {
    return (
      <div className="stack">
        <h1>Calendar</h1>
        <section className="card">
          <p className="muted">
            {ownerName} isn't sharing her calendar right now.
          </p>
        </section>
      </div>
    );
  }

  const sel = days.find((d) => d.date === selected);

  return (
    <div className="stack">
      <CalendarGrid
        month={month}
        onMonthChange={setMonth}
        days={days}
        today={today}
        selected={selected}
        onSelect={setSelected}
        pillMode={tracking?.mode === "pill"}
        showPills={showPills}
      />

      {sel && (
        <section className="card stack">
          <h2>{format(parseISO(sel.date), "EEEE d MMMM")}</h2>
          {sel.period && (
            <p>
              Period day{" "}
              {differenceInCalendarDays(
                parseISO(sel.date),
                parseISO(sel.period.start_date),
              ) + 1}
            </p>
          )}
          {sel.predictedBleed && (
            <p className="muted">Bleed predicted (estimate)</p>
          )}
          {sel.pill && (
            <p>
              Pill {sel.pill.number}:{" "}
              {sel.pill.taken
                ? "taken ✓"
                : sel.pill.missed
                  ? "not marked"
                  : "upcoming"}
            </p>
          )}
          {sel.off && <p className="muted">Break day {sel.off}</p>}
          {sel.ovulation && <p className="muted">Ovulation estimated</p>}
          {sel.fertile && !sel.ovulation && (
            <p className="muted">Fertile window (estimate)</p>
          )}
          {!sel.period &&
            !sel.predictedBleed &&
            !sel.pill &&
            !sel.off &&
            !sel.fertile && <p className="muted">Nothing logged.</p>}
        </section>
      )}

      <Disclaimer />
    </div>
  );
}
