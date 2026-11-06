import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { Check, ChevronLeft, ChevronRight, CircleAlert } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { setPillTaken } from "../../data/actions";
import type { TrackingRow } from "../../data/db";
import { usePeriods, usePillLogs } from "../../data/hooks";
import {
  calibrateBleed,
  expectedBleed,
  packDay,
  packDays,
  type PackConfig,
} from "../../lib/pill";
import PackBars, { type BarState } from "../ui/PackBars";
import PillStrip, { StripLegend } from "./PillStrip";

const day = (d: Date) => format(d, "EEE d MMM");
const short = (d: Date) => format(d, "d MMM");
/** "11–14 Nov", or "29 Nov–2 Dec" across months. */
const range = (a: Date, b: Date) =>
  a.getMonth() === b.getMonth() ? `${format(a, "d")}–${format(b, "d MMM")}` : `${short(a)}–${short(b)}`;

function relativeDay(target: Date, today: Date) {
  const n = differenceInCalendarDays(target, today);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n < 7) return format(target, "EEEE");
  return day(target);
}

/**
 * Pill-mode Today: the lilac hero block (pill number, pack bars, Mark taken),
 * then `children` (the Period / Today tiles), then the pack history strip.
 */
export default function PillToday({
  ownerId,
  tracking,
  today,
  children,
}: {
  ownerId: string;
  tracking: TrackingRow;
  today: string;
  children?: ReactNode;
}) {
  const periods = usePeriods(ownerId);
  const cfg: PackConfig = calibrateBleed(
    {
      packStart: tracking.pack_start_date!,
      activeDays: tracking.active_days,
      breakDays: tracking.break_days,
    },
    periods ?? [],
  );
  const todayDate = parseISO(today);
  const info = packDay(cfg, todayDate);

  const [params] = useSearchParams();
  const fromReminder = params.has("take");

  // This pack (for the hero bars)…
  const current = packDays(cfg, info.packStart);
  const currentLogs = usePillLogs(
    ownerId,
    current[0].date,
    current[current.length - 1].date,
  );
  const takenToday = currentLogs?.get(today);

  // …and whichever pack the history strip shows: 0 = current, -1 = previous, …
  const [offset, setOffset] = useState(0);
  const cycle = cfg.activeDays + cfg.breakDays;
  const shownStart = new Date(info.packStart);
  shownStart.setDate(shownStart.getDate() + offset * cycle);
  const strip = packDays(cfg, shownStart);
  const canGoBack = info.packNumber + offset > 0;
  const stripLogs = usePillLogs(
    ownerId,
    strip[0].date,
    strip[strip.length - 1].date,
  );

  const missed = current.filter(
    (d) => d.kind === "active" && d.date < today && !currentLogs?.has(d.date),
  ).length;
  const bleed = expectedBleed(info, cfg);
  const showBleed =
    bleed &&
    info.kind !== "before" &&
    differenceInCalendarDays(bleed.end, todayDate) >= 0;

  const bars: BarState[] = current.map((d) => {
    if (info.kind === "before") return d.kind === "off" ? "brk" : "todo";
    if (d.date === today) return "now";
    if (d.kind === "off") return d.predictedBleed ? "bleed" : "brk";
    if (d.date < today) return currentLogs?.has(d.date) ? "done" : "miss";
    return "todo";
  });

  const left = cfg.activeDays - info.number;
  const lineParts: string[] = [];
  if (info.kind === "active") {
    lineParts.push(left === 0 ? "Last pill" : `${left} left`);
    if (cfg.breakDays > 0)
      lineParts.push(`break ${relativeDay(info.breakStart, todayDate)}`);
  }
  if (info.kind === "off")
    lineParts.push(`new pack ${relativeDay(info.nextPackStart, todayDate)}`);
  if (showBleed)
    lineParts.push(`bleed ~ ${range(bleed.start, bleed.end)}`);

  return (
    <>
      <section className="blk blk-lilac" aria-label="Pill pack today">
        <div className="blk-head">
          <span className="blk-chip">
            {info.kind === "active"
              ? "Active pills"
              : info.kind === "off"
                ? "Break week"
                : "New pack soon"}
          </span>
          <span className="blk-line">Pack since {short(info.packStart)}</span>
        </div>

        <div className="big-row">
          {info.kind === "before" ? (
            <span className="big-num">
              {info.daysUntilStart === 1
                ? "Tomorrow"
                : `In ${info.daysUntilStart} days`}
            </span>
          ) : (
            <>
              <span className="big-num">
                {info.kind === "active" ? "Pill" : "Break"} {info.number}
              </span>
              <span className="soft-ink" style={{ fontWeight: 700 }}>
                of {info.kind === "active" ? cfg.activeDays : cfg.breakDays}
              </span>
            </>
          )}
        </div>

        <PackBars
          bars={bars}
          label={`Day ${info.kind === "off" ? cfg.activeDays + info.number : info.number} of a ${cycle}-day pack`}
        />

        {lineParts.length > 0 && (
          <p className="blk-line">{lineParts.join(" · ")}</p>
        )}

        {info.kind === "active" &&
          (takenToday ? (
            <div className="taken-done">
              <span className="taken-badge">
                <span className="check">
                  <Check size={18} strokeWidth={3} />
                </span>
                Taken
                {takenToday.taken_at &&
                  ` at ${format(parseISO(takenToday.taken_at), "HH:mm")}`}
              </span>
              <button
                className="btn link sm"
                onClick={() => setPillTaken(ownerId, today, false)}
              >
                Undo
              </button>
            </div>
          ) : (
            <button
              className={`btn ink take${fromReminder ? " pulse" : ""}`}
              onClick={() => setPillTaken(ownerId, today, true)}
            >
              <Check size={19} strokeWidth={2.8} /> Mark taken
            </button>
          ))}
      </section>

      {children}

      <section className="card stack" aria-labelledby="pack-title">
        <div className="section-head">
          <div>
            <h2 id="pack-title">
              {offset === 0
                ? "This pack"
                : offset === 1
                  ? "Next pack"
                  : "Earlier pack"}
            </h2>
            <p className="muted small">
              Tap a past pill to mark it · started {day(shownStart)}
            </p>
          </div>
          <div className="pager">
            <button
              className="icon-btn"
              disabled={!canGoBack}
              onClick={() => setOffset((o) => o - 1)}
              aria-label="Previous pack"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              className="icon-btn"
              disabled={offset >= 1}
              onClick={() => setOffset((o) => o + 1)}
              aria-label="Next pack"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        <PillStrip
          ownerId={ownerId}
          days={strip}
          logs={stripLogs}
          today={today}
        />

        {offset === 0 && missed > 0 && (
          <p className="note-inline">
            <CircleAlert size={16} />
            <span>
              {missed === 1 ? "1 pill isn't" : `${missed} pills aren't`} marked.
              Tap it if you took it. If you missed one, check your pack leaflet
              or ask your doctor.
            </span>
          </p>
        )}
        <StripLegend />
      </section>
    </>
  );
}
