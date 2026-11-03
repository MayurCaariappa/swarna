import {
  differenceInCalendarDays,
  format,
  parseISO,
  startOfMonth,
} from "date-fns";
import { useMemo, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import CalendarGrid from "../components/calendar/CalendarGrid";
import Disclaimer from "../components/Disclaimer";
import DailyLogSheet from "../components/log/DailyLogSheet";
import LogSummary from "../components/log/LogSummary";
import PeriodEditor from "../components/period/PeriodEditor";
import { endPeriod, setPillTaken } from "../data/actions";
import type { PeriodRow } from "../data/db";
import {
  hasContent,
  useDailyLog,
  useLoggedDates,
  usePeriods,
  usePillLogs,
  useTracking,
} from "../data/hooks";
import { buildMonthDays, monthGrid } from "../lib/calendarDays";
import { useToday } from "../lib/useToday";

export default function Calendar() {
  const { session } = useAuth();
  const ownerId = session!.user.id;
  const today = useToday();
  const tracking = useTracking(ownerId);
  const periods = usePeriods(ownerId);

  const [month, setMonth] = useState(() => startOfMonth(parseISO(today)));
  const [selected, setSelected] = useState<string>(today);
  const [editing, setEditing] = useState<PeriodRow | "new" | null>(null);

  const grid = monthGrid(month);
  const logs = usePillLogs(ownerId, grid.from, grid.to);
  const loggedDates = useLoggedDates(ownerId, grid.from, grid.to);
  const selectedLog = useDailyLog(ownerId, selected);
  const [logOpen, setLogOpen] = useState(false);

  const days = useMemo(
    () =>
      periods && tracking !== undefined
        ? buildMonthDays(month, today, periods, tracking, logs ?? new Map()).map((d) => ({
            ...d,
            logged: loggedDates?.has(d.date) ?? false,
          }))
        : [],
    [month, today, periods, tracking, logs, loggedDates],
  );

  if (!periods || tracking === undefined) return null;

  const sel = days.find((d) => d.date === selected);
  const pillMode = tracking?.mode === "pill";
  // Most recent period before the selected day that has no end yet → offer "ended this day".
  const openBefore = [...periods]
    .reverse()
    .find(
      (p) =>
        p.start_date < selected &&
        (p.end_date === null || p.end_date < selected) &&
        differenceInCalendarDays(parseISO(selected), parseISO(p.start_date)) <
          15 &&
        !periods.some(
          (q) => q.start_date > p.start_date && q.start_date <= selected,
        ),
    );

  return (
    <div className="stack">
      <CalendarGrid
        month={month}
        onMonthChange={setMonth}
        days={days}
        today={today}
        selected={selected}
        onSelect={(d) => {
          setSelected(d);
          setEditing(null);
        }}
        pillMode={pillMode}
        showPills
      />

      {sel && (
        <section className="card stack">
          <h2>{format(parseISO(sel.date), "EEEE d MMMM")}</h2>

          {editing ? (
            <PeriodEditor
              ownerId={ownerId}
              period={editing === "new" ? null : editing}
              defaultStart={sel.date}
              all={periods}
              today={today}
              onDone={() => setEditing(null)}
            />
          ) : (
            <>
              {sel.period ? (
                <div className="row-between">
                  <span>
                    Period day{" "}
                    {differenceInCalendarDays(
                      parseISO(sel.date),
                      parseISO(sel.period.start_date),
                    ) + 1}
                    <span className="muted small block">
                      {format(parseISO(sel.period.start_date), "d MMM")} –{" "}
                      {sel.period.end_date
                        ? format(parseISO(sel.period.end_date), "d MMM")
                        : "ongoing"}
                    </span>
                  </span>
                  <button
                    className="btn"
                    onClick={() => setEditing(sel.period!)}
                  >
                    Edit
                  </button>
                </div>
              ) : sel.date <= today ? (
                <div className="stack">
                  {openBefore && (
                    <button
                      className="btn"
                      onClick={() => endPeriod(openBefore, sel.date)}
                    >
                      Period ended this day
                    </button>
                  )}
                  <button
                    className="btn bleed"
                    onClick={() => setEditing("new")}
                  >
                    Log a period starting this day
                  </button>
                </div>
              ) : sel.predictedBleed ? (
                <p className="muted">Bleed predicted (estimate)</p>
              ) : null}

              {sel.pill && (
                <div className="row-between">
                  <span>
                    Pill {sel.pill.number}
                    <span className="muted small block">
                      {sel.pill.taken
                        ? "Taken ✓"
                        : sel.pill.missed
                          ? "Not marked — check your leaflet or doctor if missed"
                          : "Upcoming"}
                    </span>
                  </span>
                  {sel.date <= today && (
                    <button
                      className="btn"
                      onClick={() =>
                        setPillTaken(ownerId, sel.date, !sel.pill!.taken)
                      }
                    >
                      {sel.pill.taken ? "Unmark" : "Mark taken"}
                    </button>
                  )}
                </div>
              )}
              {sel.off && <p className="muted">Break day {sel.off}</p>}
              {sel.ovulation && (
                <p className="muted">Ovulation estimated (estimate)</p>
              )}
              {sel.fertile && !sel.ovulation && (
                <p className="muted">Fertile window (estimate)</p>
              )}

              {sel.date <= today && (
                <div className="stack day-log">
                  {selectedLog && hasContent(selectedLog) && <LogSummary log={selectedLog} />}
                  <button className="btn" onClick={() => setLogOpen(true)}>
                    {selectedLog && hasContent(selectedLog) ? "Edit daily log" : "Add daily log"}
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {logOpen && <DailyLogSheet ownerId={ownerId} date={selected} onClose={() => setLogOpen(false)} />}

      <Disclaimer />
    </div>
  );
}
