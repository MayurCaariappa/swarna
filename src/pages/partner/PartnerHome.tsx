import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import { ChevronRight, Droplet, Pill } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import Disclaimer from "../../components/Disclaimer";
import WelcomeCard from "../../components/WelcomeCard";
import LogSummary from "../../components/log/LogSummary";
import PackBars, { type BarState } from "../../components/ui/PackBars";
import PageHeader from "../../components/ui/PageHeader";
import { greeting } from "../../lib/greeting";
import { cycleDay, naturalPeriods, periodOn, predict } from "../../lib/cycle";
import {
  calibrateBleed,
  nextPillBleed,
  packDay,
  packDays,
  toISODate,
  type PackConfig,
} from "../../lib/pill";
import { BLEEDING, naturalPhase, pillPhase } from "../../lib/phase";
import { usePartnerData } from "../../partner/PartnerData";

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
    logs,
  } = usePartnerData();
  const todayLog = logs?.[today];
  const { profile } = useAuth();
  const header = (
    <PageHeader
      eyebrow={new Date(today + "T12:00").toLocaleDateString(undefined, {
        weekday: "long",
        day: "numeric",
        month: "short",
      })}
      subtitle={`Here's how ${name} is doing`}
      title={`${greeting()
        .replace("Good ", "")
        .replace(/^./, (c) =>
          c.toUpperCase(),
        )}, ${profile?.display_name || "there"}`}
    />
  );
  const showPeriods = sharing?.share_periods ?? false;
  const showPill = sharing?.share_pill_status ?? false;
  const todayDate = parseISO(today);

  if (!loaded && !sharing) {
    return (
      <div className="stack">
        {header}
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
      ? calibrateBleed(
          {
            packStart: tracking.pack_start_date,
            activeDays: tracking.active_days,
            breakDays: tracking.break_days,
          },
          periods,
        )
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

  // Where she is in her pack / cycle, for the hero.
  const natural = tracking
    ? naturalPeriods(periods, tracking.natural_since)
    : [];
  let big = "";
  let of = "";
  let bars: BarState[] = [];
  if (pd && cfg) {
    const packStart = addDays(
      todayDate,
      -((pd.kind === "active" ? pd.number : cfg.activeDays + pd.number) - 1),
    );
    big =
      pd.kind === "active"
        ? `Pill ${pd.number}`
        : pd.kind === "off"
          ? `Break ${pd.number}`
          : "New pack soon";
    of =
      pd.kind === "active"
        ? `of ${cfg.activeDays}`
        : pd.kind === "off"
          ? `of ${cfg.breakDays}`
          : "";
    if (pd.kind !== "before") {
      bars = packDays(cfg, packStart).map((d) =>
        d.date === today
          ? "now"
          : d.kind === "off"
            ? d.predictedBleed
              ? "bleed"
              : "brk"
            : d.date < today
              ? "done"
              : "todo",
      );
    }
  } else if (prediction) {
    const cd = cycleDay(natural, today) ?? 0;
    big = `Day ${cd || "–"}`;
    of = `of ~${prediction.avgCycle}`;
    const length = Math.min(Math.max(prediction.avgCycle, cd), 45);
    bars = Array.from({ length }, (_, i) => {
      const date = toISODate(addDays(parseISO(prediction.lastStart), i));
      if (date === today) return "now";
      if (periodOn(periods, date, today)) return "bleed";
      if (date >= prediction.fertileStart && date <= prediction.fertileEnd)
        return "fert";
      return date < today ? "done" : "todo";
    });
  }

  const nextValue = bleeding
    ? `Now · day ${bleedDay}`
    : prediction && prediction.daysLate > 0
      ? `${prediction.daysLate} day${prediction.daysLate === 1 ? "" : "s"} late`
      : untilNext !== null
        ? untilNext <= 0
          ? "Today"
          : untilNext === 1
            ? "Tomorrow"
            : `In ${untilNext} days`
        : "–";
  const pillTile = showPill && cfg && pd?.kind === "active";

  return (
    <div className="stack">
      {header}

      <WelcomeCard />

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
        <section
          className="blk blk-lilac"
          aria-label={cfg ? "Pill pack today" : "Cycle today"}
        >
          <div className="blk-head">
            <span className={`blk-chip ${bleeding ? "bleed" : ""}`}>
              {bleeding ? `Bleeding · day ${bleedDay}` : "Not bleeding"}
            </span>
            {phase && <span className="blk-line">{phase.label}</span>}
          </div>
          {big && (
            <div className="big-row">
              <span className="big-num">{big}</span>
              {of && (
                <span className="soft-ink" style={{ fontWeight: 700 }}>
                  {of}
                </span>
              )}
            </div>
          )}
          {bars.length > 0 && <PackBars bars={bars} label={`${big} ${of}`} />}
          {phase && <p className="blk-line">{phase.tip}</p>}
          {tracking.mode === "natural" && !prediction && (
            <p className="blk-line">
              Predictions appear once {name} logs a period.
            </p>
          )}
        </section>
      )}

      {(showPeriods && next) || pillTile ? (
        <div className="quick" role="group" aria-label="At a glance">
          {showPeriods && next && (
            <Link
              to={`/partner/calendar?date=${toISODate(next.start)}`}
              className={`tile tile-link blk-rose ${pillTile ? "" : "span-2"}`}
              aria-label={`Next bleed: ${nextValue}${bleeding ? "" : `, about ${format(next.start, "d MMMM")} to ${format(next.end, "d MMMM")}`}. Open in calendar`}
            >
              <div className="tile-icon">
                <Droplet size={18} />
              </div>
              <ChevronRight className="tile-go" size={18} aria-hidden />
              <p className="tile-label">Next bleed</p>
              <p className="tile-value">{nextValue}</p>
              {!bleeding && (
                <p className="tile-note">
                  ~{format(next.start, "d MMM")} – {format(next.end, "d MMM")}
                </p>
              )}
            </Link>
          )}
          {pillTile && (
            <Link
              to="/partner/calendar"
              className={`tile tile-link blk-mint ${showPeriods && next ? "" : "span-2"}`}
              aria-label={`Pill today: ${takenToday ? `taken${takenTime ? ` at ${format(parseISO(takenTime), "HH:mm")}` : ""}` : "not taken yet"}. Open in calendar`}
            >
              <div className="tile-icon">
                <Pill size={18} />
              </div>
              <ChevronRight className="tile-go" size={18} aria-hidden />
              <p className="tile-label">Pill today</p>
              <p className="tile-value">{takenToday ? "Taken ✓" : "Not taken yet"}</p>
              {takenToday && takenTime && (
                <p className="tile-note">
                  at {format(parseISO(takenTime), "HH:mm")}
                </p>
              )}
            </Link>
          )}
        </div>
      ) : null}

      {todayLog && (
        <section className="card stack" aria-labelledby="her-today">
          <h2 id="her-today">{name} today</h2>
          <LogSummary log={todayLog} />
        </section>
      )}

      <Disclaimer />
    </div>
  );
}
