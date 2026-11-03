import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { useMemo, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import Disclaimer from "../components/Disclaimer";
import PeriodEditor from "../components/period/PeriodEditor";
import { endPeriod, setPillTaken } from "../data/actions";
import type { PeriodRow, PillLogRow, TrackingRow } from "../data/db";
import { usePeriods, usePillLogs, useTracking } from "../data/hooks";
import {
  futureCycles,
  naturalPeriods,
  periodOn,
  predict,
  type PredictedCycle,
} from "../lib/cycle";
import {
  isPredictedBleedDay,
  packDay,
  toISODate,
  type PackConfig,
} from "../lib/pill";
import { useToday } from "../lib/useToday";

const WEEK = { weekStartsOn: 1 as const }; // Monday first

interface DayInfo {
  date: string;
  inMonth: boolean;
  period?: PeriodRow;
  predictedBleed: boolean;
  pill?: { number: number; taken: boolean; missed: boolean };
  off?: number;
  fertile: boolean;
  ovulation: boolean;
}

/** Everything drawn on one calendar day. */
function describeDay(
  date: string,
  inMonth: boolean,
  today: string,
  periods: PeriodRow[],
  tracking: TrackingRow | null,
  logs: Map<string, PillLogRow> | undefined,
  cycles: PredictedCycle[],
): DayInfo {
  const info: DayInfo = {
    date,
    inMonth,
    predictedBleed: false,
    fertile: false,
    ovulation: false,
  };
  info.period = periodOn(periods, date, today);

  // Don't predict a bleed right after one she has logged.
  const recentlyLogged = periods.some((p) => {
    const n = differenceInCalendarDays(parseISO(date), parseISO(p.start_date));
    return n >= 0 && n < 12;
  });

  if (tracking?.mode === "pill" && tracking.pack_start_date) {
    const cfg: PackConfig = {
      packStart: tracking.pack_start_date,
      activeDays: tracking.active_days,
      breakDays: tracking.break_days,
    };
    const pd = packDay(cfg, parseISO(date));
    if (pd.kind === "active") {
      const taken = logs?.has(date) ?? false;
      info.pill = { number: pd.number, taken, missed: !taken && date < today };
    } else if (pd.kind === "off") {
      info.off = pd.number;
      info.predictedBleed =
        !info.period &&
        !recentlyLogged &&
        date >= today &&
        isPredictedBleedDay(cfg, pd);
    }
  }

  if (tracking?.mode === "natural") {
    for (const c of cycles) {
      if (
        date >= c.bleedStart &&
        date <= c.bleedEnd &&
        !info.period &&
        !recentlyLogged &&
        date >= today
      )
        info.predictedBleed = true;
      if (date >= c.fertileStart && date <= c.fertileEnd) info.fertile = true;
      if (date === c.ovulation) info.ovulation = true;
    }
  }
  return info;
}

export default function Calendar() {
  const { session } = useAuth();
  const ownerId = session!.user.id;
  const today = useToday();
  const tracking = useTracking(ownerId);
  const periods = usePeriods(ownerId);

  const [month, setMonth] = useState(() => startOfMonth(parseISO(today)));
  const [selected, setSelected] = useState<string>(today);
  const [editing, setEditing] = useState<PeriodRow | "new" | null>(null);

  const gridStart = startOfWeek(month, WEEK);
  const gridEnd = endOfWeek(endOfMonth(month), WEEK);
  const logs = usePillLogs(ownerId, toISODate(gridStart), toISODate(gridEnd));

  const cycles = useMemo(() => {
    if (!periods || tracking?.mode !== "natural") return [];
    const p = predict(naturalPeriods(periods, tracking.natural_since), today);
    return p ? futureCycles(p, 6) : [];
  }, [periods, tracking, today]);

  const days = useMemo(() => {
    if (!periods || tracking === undefined) return [];
    const out: DayInfo[] = [];
    for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) {
      out.push(
        describeDay(
          toISODate(d),
          d.getMonth() === month.getMonth(),
          today,
          periods,
          tracking,
          logs,
          cycles,
        ),
      );
    }
    return out;
    // gridStart/gridEnd derive from month
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, today, periods, tracking, logs, cycles]);

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
      <div className="cal-head">
        <button
          className="btn link"
          onClick={() => setMonth((m) => addMonths(m, -1))}
          aria-label="Previous month"
        >
          ‹
        </button>
        <h1>{format(month, "MMMM yyyy")}</h1>
        <button
          className="btn link"
          onClick={() => setMonth((m) => addMonths(m, 1))}
          aria-label="Next month"
        >
          ›
        </button>
      </div>

      <div className="cal">
        {["M", "T", "W", "T", "F", "S", "S"].map((w, i) => (
          <div key={i} className="cal-wd">
            {w}
          </div>
        ))}
        {days.map((d) => (
          <button
            key={d.date}
            className={[
              "cal-day",
              d.inMonth ? "" : "out",
              d.period ? "bleed" : "",
              d.predictedBleed ? "predicted" : "",
              d.fertile ? "fertile" : "",
              d.ovulation ? "ovulation" : "",
              d.off ? "off" : "",
              d.date === today ? "today" : "",
              d.date === selected ? "selected" : "",
            ].join(" ")}
            onClick={() => {
              setSelected(d.date);
              setEditing(null);
            }}
          >
            <span>{parseISO(d.date).getDate()}</span>
            {d.pill && (
              <i
                className={`dot ${d.pill.taken ? "taken" : d.pill.missed ? "missed" : ""}`}
              />
            )}
          </button>
        ))}
      </div>

      <Legend pillMode={pillMode} />

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
            </>
          )}
        </section>
      )}

      <Disclaimer />
    </div>
  );
}

function Legend({ pillMode }: { pillMode: boolean }) {
  return (
    <div className="legend small muted">
      <span>
        <i className="sw bleed" /> period
      </span>
      <span>
        <i className="sw predicted" /> predicted
      </span>
      {pillMode ? (
        <>
          <span>
            <i className="dot taken" /> pill taken
          </span>
          <span>
            <i className="dot missed" /> not marked
          </span>
          <span>
            <i className="sw off" /> break
          </span>
        </>
      ) : (
        <>
          <span>
            <i className="sw fertile" /> fertile window
          </span>
          <span>
            <i className="sw ovulation" /> ovulation
          </span>
        </>
      )}
    </div>
  );
}
