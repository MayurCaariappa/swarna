import { format, parseISO } from "date-fns";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import CycleChart from "../components/stats/CycleChart";
import PageHeader from "../components/ui/PageHeader";
import WeightChart from "../components/stats/WeightChart";
import {
  useAllDailyLogs,
  usePeriods,
  usePillLogs,
  useTracking,
} from "../data/hooks";
import { naturalPeriods } from "../lib/cycle";
import {
  completedCycles,
  monthlyTrends,
  pillAdherence,
  summarize,
  symptomPatterns,
  weightSeries,
} from "../lib/stats";
import { useToday } from "../lib/useToday";

const REGULARITY = {
  regular: "Regular",
  somewhat: "Fairly regular",
  irregular: "Irregular",
} as const;

export default function Stats() {
  const { session } = useAuth();
  const ownerId = session!.user.id;
  const today = useToday();
  const tracking = useTracking(ownerId);
  const periods = usePeriods(ownerId);
  const logs = useAllDailyLogs(ownerId);
  const pills = usePillLogs(ownerId, "0000-01-01", "9999-12-31");

  const data = useMemo(() => {
    if (!periods || !logs || tracking === undefined) return null;
    // In natural mode, averages use only cycles since stopping the pill.
    const relevant =
      tracking?.mode === "natural"
        ? naturalPeriods(periods, tracking.natural_since)
        : periods;
    const cfg =
      tracking?.mode === "pill" && tracking.pack_start_date
        ? {
            packStart: tracking.pack_start_date,
            activeDays: tracking.active_days,
            breakDays: tracking.break_days,
          }
        : null;
    return {
      summary: summarize(relevant),
      cycles: completedCycles(relevant),
      patterns: symptomPatterns(periods, logs),
      months: monthlyTrends(logs, today),
      weights: weightSeries(logs),
      adherence:
        cfg && pills ? pillAdherence(cfg, new Set(pills.keys()), today) : [],
    };
  }, [periods, logs, tracking, pills, today]);

  if (!data) return null;
  const { summary, cycles, patterns, months, weights, adherence } = data;
  const pillMode = tracking?.mode === "pill";

  return (
    <div className="stack">
      <PageHeader title="Stats" />

      <section className="card tiles" aria-label="Summary">
        <Tile
          value={summary.avgCycle}
          unit="days"
          label={pillMode ? "avg bleed-to-bleed" : "avg cycle"}
          empty="needs 2 periods"
        />
        <Tile
          value={summary.avgBleed}
          unit="days"
          label="avg bleed"
          empty="needs an ended period"
        />
        <Tile
          value={summary.regularity ? REGULARITY[summary.regularity] : null}
          label={
            summary.variation !== null
              ? `±${summary.variation} days`
              : "regularity"
          }
        />
        <Tile value={summary.periodsLogged} label="periods logged" />
      </section>

      <section className="card stack">
        <h2>Recent cycles</h2>
        {cycles.length === 0 ? (
          <p className="muted small">Appears after two logged periods.</p>
        ) : (
          <>
            <CycleChart cycles={cycles} average={summary.avgCycle} />
            {summary.shortest !== null && (
              <p className="muted small">
                Shortest {summary.shortest} days · longest {summary.longest}{" "}
                days
              </p>
            )}
            <details>
              <summary className="small muted">Show as a table</summary>
              <table className="table small">
                <thead>
                  <tr>
                    <th>Started</th>
                    <th>Cycle</th>
                    <th>Bleed</th>
                  </tr>
                </thead>
                <tbody>
                  {[...cycles].reverse().map((c) => (
                    <tr key={c.start}>
                      <td>{format(parseISO(c.start), "d MMM yyyy")}</td>
                      <td>{c.length} d</td>
                      <td>{c.bleed ? `${c.bleed} d` : "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </>
        )}
      </section>

      {adherence.length > 0 && (
        <section className="card stack">
          <h2>Pills taken</h2>
          {adherence.map((a) => (
            <div key={a.packStart} className="row-between small">
              <span>
                {a.current
                  ? "This pack"
                  : `Pack from ${format(parseISO(a.packStart), "d MMM")}`}
              </span>
              <span>
                {a.taken} of {a.due}
                {a.due > 0 && (
                  <span className="muted">
                    {" "}
                    · {Math.round((a.taken / a.due) * 100)}%
                  </span>
                )}
              </span>
            </div>
          ))}
        </section>
      )}

      <section className="card stack">
        <h2>Symptom patterns</h2>
        {patterns.length === 0 ? (
          <p className="muted small">
            Log symptoms for a couple of cycles to see when they usually happen.
          </p>
        ) : (
          patterns.map((p) => (
            <div key={p.symptom} className="row-between small">
              <span>
                <strong>{p.label}</strong>
                <span className="muted block">
                  {p.from === null
                    ? p.count < 3
                      ? "Not enough data yet"
                      : "No clear pattern yet"
                    : `Usually on ${p.from === p.to ? `day ${p.from}` : `days ${p.from}–${p.to}`} of your cycle`}
                </span>
              </span>
              <span className="muted">
                {p.from !== null
                  ? `${p.inWindow} of ${p.count}`
                  : `${p.count}×`}
              </span>
            </div>
          ))
        )}
        <p className="muted small">Day 1 is the first day of bleeding.</p>
      </section>

      <section className="card stack">
        <h2>PCOS trends</h2>
        <p className="muted small">
          Days logged each month. Watch how these change over time.
        </p>
        <table className="table small">
          <thead>
            <tr>
              <th>Month</th>
              <th>Acne</th>
              <th>Hair</th>
              <th>Low mood</th>
              <th>Weight</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.key} className={m.loggedDays === 0 ? "muted" : ""}>
                <td>{m.month}</td>
                <td>{m.loggedDays ? m.acneDays : "–"}</td>
                <td>{m.loggedDays ? m.hairDays : "–"}</td>
                <td>{m.loggedDays ? m.lowMoodDays : "–"}</td>
                <td>{m.avgWeight ?? "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted small">
          Low mood = days logged as low, sad or irritable. Weight = monthly
          average (kg).
        </p>
      </section>

      {weights.length > 0 && (
        <section className="card stack">
          <h2>Weight</h2>
          <WeightChart points={weights} />
        </section>
      )}

      <Link to="/export" className="btn">
        Export for your doctor
      </Link>

      <p className="disclaimer">
        Stats describe what you've logged — they're not a diagnosis.
      </p>
    </div>
  );
}

function Tile({
  value,
  unit,
  label,
  empty,
}: {
  value: number | string | null;
  unit?: string;
  label: string;
  /** Why there's no value yet, e.g. "needs 2 periods". */
  empty?: string;
}) {
  return (
    <div className="tile-stat">
      <p className="stat">
        {value ?? "–"}
        {value !== null && unit && <span className="unit"> {unit}</span>}
      </p>
      <p className="muted small">{label}</p>
      {value === null && empty && <p className="muted tiny">{empty}</p>}
    </div>
  );
}
