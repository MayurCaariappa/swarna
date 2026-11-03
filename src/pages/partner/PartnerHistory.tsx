import { differenceInCalendarDays, format, parseISO } from "date-fns";
import CycleChart from "../../components/stats/CycleChart";
import { cycleLengths } from "../../lib/cycle";
import { completedCycles, symptomPatterns } from "../../lib/stats";
import { usePartnerData } from "../../partner/PartnerData";

const len = (start: string, end: string) =>
  differenceInCalendarDays(parseISO(end), parseISO(start)) + 1;
const avg = (xs: number[]) =>
  xs.length
    ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10
    : null;

/** "Periods" tab: every logged bleed with start, end, length, and averages. */
export default function PartnerHistory() {
  const { ownerName, sharing, periods, logs } = usePartnerData();

  if (!sharing?.share_periods) {
    return (
      <div className="stack">
        <h1>Periods</h1>
        <section className="card">
          <p className="muted">
            {ownerName} isn't sharing her periods right now.
          </p>
        </section>
      </div>
    );
  }

  const ended = periods.filter((p) => p.end_date);
  const avgBleed = avg(ended.map((p) => len(p.start_date, p.end_date!)));
  const avgCycle = avg(cycleLengths(periods));
  const cycles = completedCycles(periods);
  // Only symptoms she shares reach this phone; empty when not shared.
  const patterns = symptomPatterns(
    periods,
    Object.values(logs ?? {}).map((l) => ({
      date: l.date,
      symptoms: l.symptoms ?? [],
    })),
  ).filter((p) => p.from !== null);
  const newestFirst = [...periods].reverse();

  return (
    <div className="stack">
      <h1>Periods</h1>

      <p className="muted">
        Every period {ownerName} has logged, newest first.
      </p>

      <section className="card stats-row">
        <div>
          <p className="stat">{periods.length}</p>
          <p className="muted small">bleeds logged</p>
        </div>
        <div>
          <p className="stat">{avgBleed ?? "–"}</p>
          <p className="muted small">avg days</p>
        </div>
        <div>
          <p className="stat">{avgCycle ?? "–"}</p>
          <p className="muted small">avg cycle</p>
        </div>
      </section>

      {cycles.length > 0 && (
        <section className="card stack">
          <h2>Recent cycles</h2>
          <CycleChart cycles={cycles} average={avgCycle} />
        </section>
      )}

      {patterns.length > 0 && (
        <section className="card stack">
          <h2>Patterns</h2>
          {patterns.map((p) => (
            <p key={p.symptom} className="small">
              <strong>{p.label}</strong>{" "}
              <span className="muted">
                usually on{" "}
                {p.from === p.to ? `day ${p.from}` : `days ${p.from}–${p.to}`}{" "}
                of her cycle
              </span>
            </p>
          ))}
          <p className="muted small">
            Day 1 is the first day of bleeding. Handy for knowing when to be
            extra supportive.
          </p>
        </section>
      )}

      {newestFirst.length === 0 ? (
        <section className="card">
          <p className="muted">No bleeds logged yet.</p>
        </section>
      ) : (
        <section className="card history">
          {newestFirst.map((p, i) => {
            const prev = newestFirst[i + 1];
            const cycle = prev
              ? differenceInCalendarDays(
                  parseISO(p.start_date),
                  parseISO(prev.start_date),
                )
              : null;
            return (
              <div key={p.id} className="history-row">
                <div>
                  <strong>
                    {format(parseISO(p.start_date), "d MMM yyyy")}
                  </strong>
                  <span className="muted small block">
                    {p.end_date
                      ? `to ${format(parseISO(p.end_date), "d MMM")}`
                      : "ongoing"}
                    {cycle ? ` · ${cycle}-day cycle` : ""}
                  </span>
                </div>
                <span className="history-len">
                  {p.end_date ? `${len(p.start_date, p.end_date)} d` : "…"}
                </span>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
