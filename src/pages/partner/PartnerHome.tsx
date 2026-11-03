import { differenceInCalendarDays, format, parseISO } from "date-fns";
import Disclaimer from "../../components/Disclaimer";
import { cycleDay, naturalPeriods, periodOn, predict } from "../../lib/cycle";
import { nextPillBleed, packDay, type PackConfig } from "../../lib/pill";
import { BLEEDING, naturalPhase, pillPhase } from "../../lib/phase";
import { usePartnerData } from "../../partner/PartnerData";

const day = (d: Date) => format(d, "EEE d MMM");
const inDays = (n: number) =>
  n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`;

/** Partner home: bleeding now?, pack/cycle day, phase + tip, next bleed, pill today. */
export default function PartnerHome() {
  const {
    ownerName: name,
    sharing,
    tracking,
    periods,
    takenAt,
    takenDates,
    today,
    loaded,
  } = usePartnerData();
  const showPeriods = sharing?.share_periods ?? false;
  const showPill = sharing?.share_pill_status ?? false;
  const todayDate = parseISO(today);

  if (!loaded && !sharing) {
    return (
      <div className="stack">
        <h1>{name}</h1>
        <p className="muted">Loading…</p>
      </div>
    );
  }

  const nothingShared = !showPeriods && !showPill;
  const bleeding = showPeriods ? periodOn(periods, today, today) : undefined;
  const bleedDay = bleeding
    ? differenceInCalendarDays(todayDate, parseISO(bleeding.start_date)) + 1
    : 0;

  const cfg: PackConfig | null =
    tracking?.mode === "pill" && tracking.pack_start_date
      ? {
          packStart: tracking.pack_start_date,
          activeDays: tracking.active_days,
          breakDays: tracking.break_days,
        }
      : null;
  const pd = cfg ? packDay(cfg, todayDate) : null;
  const prediction =
    tracking?.mode === "natural"
      ? predict(naturalPeriods(periods, tracking.natural_since), today)
      : null;

  const phase = cfg
    ? pillPhase(cfg, todayDate, Boolean(bleeding))
    : prediction
      ? naturalPhase(prediction, today, Boolean(bleeding))
      : bleeding
        ? BLEEDING
        : null;

  // Next bleed
  let next: { start: Date; end: Date } | null = null;
  if (cfg) next = nextPillBleed(cfg, todayDate);
  else if (prediction)
    next = {
      start: parseISO(prediction.nextStart),
      end: parseISO(prediction.nextEnd),
    };
  const untilNext = next
    ? differenceInCalendarDays(next.start, todayDate)
    : null;

  const takenToday = takenDates.includes(today);
  const takenTime = takenAt[today];

  return (
    <div className="stack">
      <h1>{name}</h1>

      {nothingShared && (
        <section className="card">
          <p className="muted">
            {name} isn't sharing cycle or pill info with you right now.
          </p>
        </section>
      )}

      {showPeriods && !tracking && (
        <section className="card">
          <p className="muted">{name} hasn't set up tracking yet.</p>
        </section>
      )}

      {showPeriods && tracking && (
        <>
          <section className={`card bleeding-now ${bleeding ? "yes" : ""}`}>
            <p className="muted small">Bleeding now?</p>
            <p className="bleeding-answer">
              {bleeding ? `Yes · day ${bleedDay}` : "No"}
            </p>
          </section>

          <section className="card hero">
            <p className="muted">
              {pd?.kind === "active"
                ? `Pill ${pd.number} of ${cfg!.activeDays}`
                : pd?.kind === "off"
                  ? `Break day ${pd.number} of ${cfg!.breakDays}`
                  : prediction
                    ? `Cycle day ${cycleDay(naturalPeriods(periods, tracking.natural_since), today) ?? "–"}`
                    : tracking.mode === "natural"
                      ? "Natural cycle"
                      : "Pill pack"}
            </p>
            {phase && <p className="hero-text">{phase.label}</p>}
            {phase && <p className="muted small">{phase.tip}</p>}
          </section>

          {next && untilNext !== null && !bleeding && (
            <section className="card">
              <p className="muted small">Next bleed</p>
              <p className="next-bleed">
                {prediction && prediction.daysLate > 0
                  ? `${prediction.daysLate} day${prediction.daysLate === 1 ? "" : "s"} later than predicted`
                  : `Expected ${inDays(Math.max(untilNext, 0))}`}
              </p>
              <p className="muted small">
                Around {day(next.start)}–{day(next.end)}
                {cfg
                  ? " · from the pack schedule"
                  : prediction
                    ? ` · confidence ${prediction.confidence}`
                    : ""}
              </p>
            </section>
          )}

          {tracking.mode === "natural" && !prediction && (
            <section className="card">
              <p className="muted">
                Predictions will appear once {name} logs a period.
              </p>
            </section>
          )}
        </>
      )}

      {showPill && cfg && pd?.kind === "active" && (
        <section className="card">
          <p className="muted small">Pill today</p>
          {takenToday ? (
            <p className="taken-badge">
              Taken ✓
              {takenTime && ` at ${format(parseISO(takenTime), "HH:mm")}`}
            </p>
          ) : (
            <p>Not marked yet</p>
          )}
        </section>
      )}

      <Disclaimer />
    </div>
  );
}
