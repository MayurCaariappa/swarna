import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { useState } from "react";
import { setPillTaken } from "../../data/actions";
import type { TrackingRow } from "../../data/db";
import { usePillLogs } from "../../data/hooks";
import { expectedBleed, packDay, packDays, type PackConfig } from "../../lib/pill";
import PillStrip, { StripLegend } from "./PillStrip";

const day = (d: Date) => format(d, "EEE d MMM");

function relativeDay(target: Date, today: Date) {
  const n = differenceInCalendarDays(target, today);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n < 7) return format(target, "EEEE");
  return day(target);
}

export default function PillToday({ ownerId, tracking, today }: { ownerId: string; tracking: TrackingRow; today: string }) {
  const cfg: PackConfig = {
    packStart: tracking.pack_start_date!,
    activeDays: tracking.active_days,
    breakDays: tracking.break_days,
  };
  const todayDate = parseISO(today);
  const info = packDay(cfg, todayDate);

  // Which pack the strip shows: 0 = current, -1 = previous, …
  const [offset, setOffset] = useState(0);
  const cycle = cfg.activeDays + cfg.breakDays;
  const shownStart = new Date(info.packStart);
  shownStart.setDate(shownStart.getDate() + offset * cycle);
  const strip = packDays(cfg, shownStart);
  const canGoBack = info.packNumber + offset > 0;

  const logs = usePillLogs(ownerId, strip[0].date, strip[strip.length - 1].date);
  const takenToday = logs?.get(today);
  const missed = offset === 0 ? strip.filter((d) => d.kind === "active" && d.date < today && !logs?.has(d.date)).length : 0;
  const bleed = expectedBleed(info, cfg);

  return (
    <>
      <section className="card hero">
        {info.kind === "before" && (
          <>
            <p className="muted">Pill pack</p>
            <p className="hero-text">Pack starts {relativeDay(info.packStart, todayDate)}</p>
          </>
        )}

        {info.kind === "active" && (
          <>
            <p className="muted">Pill pack</p>
            <p className="hero-text">
              Pill {info.number} of {cfg.activeDays}
            </p>
            <p className="muted">
              {cfg.activeDays - info.number} left
              {cfg.breakDays > 0 && ` · break starts ${relativeDay(info.breakStart, todayDate)}`}
            </p>
            {takenToday ? (
              <div className="taken-row">
                <span className="taken-badge">
                  Taken ✓{takenToday.taken_at && ` at ${format(parseISO(takenToday.taken_at), "HH:mm")}`}
                </span>
                <button className="btn link" onClick={() => setPillTaken(ownerId, today, false)}>
                  Undo
                </button>
              </div>
            ) : (
              <button className="btn primary take" onClick={() => setPillTaken(ownerId, today, true)}>
                Taken ✓
              </button>
            )}
          </>
        )}

        {info.kind === "off" && (
          <>
            <p className="muted">Break week</p>
            <p className="hero-text">
              Off day {info.number} of {cfg.breakDays}
            </p>
            <p className="muted">New pack starts {relativeDay(info.nextPackStart, todayDate)}</p>
          </>
        )}

        {bleed && info.kind !== "before" && differenceInCalendarDays(bleed.end, todayDate) >= 0 && (
          <p className="muted small">
            Withdrawal bleed expected around {day(bleed.start)}–{day(bleed.end)}
          </p>
        )}
      </section>

      {missed > 0 && (
        <section className="card warn small">
          {missed === 1 ? "1 pill" : `${missed} pills`} not marked as taken this pack. If you missed a pill, check
          your pack leaflet or ask your doctor what to do. Taken it after all? Tap it below to mark it.
        </section>
      )}

      <section className="card stack">
        <div className="strip-head">
          <button className="btn link" disabled={!canGoBack} onClick={() => setOffset((o) => o - 1)} aria-label="Previous pack">
            ‹
          </button>
          <h2>
            {offset === 0 ? "This pack" : offset === 1 ? "Next pack" : "Earlier pack"} · {day(shownStart)}
          </h2>
          <button className="btn link" disabled={offset >= 1} onClick={() => setOffset((o) => o + 1)} aria-label="Next pack">
            ›
          </button>
        </div>
        <PillStrip ownerId={ownerId} days={strip} logs={logs} today={today} />
        <StripLegend />
      </section>
    </>
  );
}
