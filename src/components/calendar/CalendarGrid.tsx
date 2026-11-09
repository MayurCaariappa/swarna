import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  addDays,
  addMonths,
  endOfWeek,
  format,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { pillStatus, type DayInfo } from "../../lib/calendarDays";
import { toISODate } from "../../lib/pill";

interface Props {
  month: Date;
  onMonthChange: (m: Date) => void;
  days: DayInfo[];
  today: string;
  selected: string | null;
  onSelect: (date: string) => void;
  /** Jump back to today; the button shows only when away from it. */
  onToday: () => void;
  atToday: boolean;
}

/** Month header + day grid + legend. Used by her calendar and the partner's. */
export default function CalendarGrid({
  month,
  onMonthChange,
  days,
  today,
  selected,
  onSelect,
  onToday,
  atToday,
}: Props) {
  // Swipe left / right on the grid to change month.
  const touch = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touch.current;
    touch.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5)
      onMonthChange(addMonths(month, dx < 0 ? 1 : -1));
  };

  // Keyboard: one Tab stop for the whole grid (the selected day); arrows move
  // by day / week, Home / End to the week's ends, Page Up / Down by month.
  const gridRef = useRef<HTMLDivElement>(null);
  const keyMoved = useRef(false);
  const tabDate = days.some((d) => d.date === selected)
    ? selected
    : (days.find((d) => d.inMonth)?.date ?? null);

  useEffect(() => {
    if (!keyMoved.current) return;
    keyMoved.current = false;
    gridRef.current
      ?.querySelector<HTMLButtonElement>(`[data-date="${selected}"]`)
      ?.focus();
  }, [selected, month]);

  const onGridKey = (e: React.KeyboardEvent) => {
    const from = (e.target as HTMLElement).dataset.date;
    if (!from) return;
    const d = parseISO(from);
    const WEEK = { weekStartsOn: 1 as const };
    const next =
      e.key === "ArrowLeft"
        ? addDays(d, -1)
        : e.key === "ArrowRight"
          ? addDays(d, 1)
          : e.key === "ArrowUp"
            ? addDays(d, -7)
            : e.key === "ArrowDown"
              ? addDays(d, 7)
              : e.key === "Home"
                ? startOfWeek(d, WEEK)
                : e.key === "End"
                  ? endOfWeek(d, WEEK)
                  : e.key === "PageUp"
                    ? addMonths(d, -1)
                    : e.key === "PageDown"
                      ? addMonths(d, 1)
                      : null;
    if (!next) return;
    e.preventDefault();
    keyMoved.current = true;
    if (!isSameMonth(next, month)) onMonthChange(startOfMonth(next));
    onSelect(toISODate(next)); // after the month change, so this day stays selected
  };

  // Full month name when it fits; "Sep 2026" only when it would be cut off.
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [shortTitle, setShortTitle] = useState(false);
  useLayoutEffect(() => {
    const h = titleRef.current;
    if (!h) return;
    const fit = () => {
      h.classList.remove("short");
      const tooWide = h.scrollWidth > h.clientWidth;
      h.classList.toggle("short", tooWide);
      setShortTitle(tooWide);
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [month]);

  // The key lists only what's visible this month. Out-of-month days show just
  // period / predicted fills (their dots and other fills are hidden).
  const inMonth = days.filter((d) => d.inMonth);
  const keyItems = [
    { show: days.some((d) => d.period), icon: "sw bleed", label: "period" },
    { show: days.some((d) => d.predictedBleed), icon: "sw predicted", label: "predicted" },
    { show: inMonth.some((d) => d.pill?.taken), icon: "dot taken", label: "pill taken" },
    { show: inMonth.some((d) => d.pill?.missed), icon: "dot missed", label: "not marked" },
    { show: inMonth.some((d) => d.off), icon: "sw off", label: "break" },
    { show: inMonth.some((d) => d.fertile && !d.ovulation), icon: "sw fertile", label: "fertile window" },
    { show: inMonth.some((d) => d.ovulation), icon: "sw ovulation", label: "ovulation" },
    { show: inMonth.some((d) => d.logged), icon: "log-mark", label: "logged" },
  ].filter((k) => k.show);

  return (
    <>
      {/* Month left (like every page title), controls grouped on the right. */}
      <div className="cal-head">
        {/* Month in ink, year quieter in grey. */}
        <h1
          ref={titleRef}
          aria-live="polite"
          aria-label={format(month, "MMMM yyyy")}
          className={shortTitle ? "short" : undefined}
        >
          <span className="m-full">{format(month, "MMMM")}</span>
          {/* Used only when the full name doesn't fit: "Sep 2026". */}
          <span className="m-short">{format(month, "MMM")}</span>
          {" "}
          <span className="cal-year">{format(month, "yyyy")}</span>
        </h1>
        <div className="cal-nav">
          {/* Kept in the layout when hidden, so the arrows never move. */}
          <button
            className="today-btn"
            onClick={onToday}
            style={atToday ? { visibility: "hidden" } : undefined}
          >
            Today
          </button>
          <button
            className="icon-btn"
            onClick={() => onMonthChange(addMonths(month, -1))}
            aria-label="Previous month"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            className="icon-btn"
            onClick={() => onMonthChange(addMonths(month, 1))}
            aria-label="Next month"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <div
        className="card cal-card stack"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div
          className="cal"
          ref={gridRef}
          role="group"
          aria-label={`${format(month, "MMMM yyyy")}. Use the arrow keys to move between days.`}
          onKeyDown={onGridKey}
        >
          {["M", "T", "W", "T", "F", "S", "S"].map((w, i) => (
            <div key={i} className="cal-wd" aria-hidden>
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
              aria-label={dayLabel(d, today)}
              aria-pressed={d.date === selected}
              data-date={d.date}
              tabIndex={d.date === tabDate ? 0 : -1}
              onClick={() => onSelect(d.date)}
            >
              <span>{parseISO(d.date).getDate()}</span>
              {/* Marks sit under the number, always the same height so numbers line up. */}
              <span className="marks" aria-hidden>
                {d.pill && (
                  <i
                    className={`dot ${d.pill.taken ? "taken" : d.pill.missed ? "missed" : ""}`}
                  />
                )}
                {d.logged && <i className="log-mark" />}
              </span>
            </button>
          ))}
        </div>

        {/* Key: only what this month actually shows. */}
        {keyItems.length > 0 && (
          <div className="legend small muted" aria-label="Key">
            {keyItems.map((k) => (
              <span key={k.label}>
                <i className={k.icon} /> {k.label}
              </span>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

/** What a screen reader says for a day, e.g. "Wednesday 4 November, pill 1 taken, logged". */
function dayLabel(d: DayInfo, today: string) {
  const parts = [format(parseISO(d.date), "EEEE d MMMM")];
  if (d.date === today) parts.push("today");
  if (d.period) parts.push("period");
  if (d.predictedBleed) parts.push("bleed predicted");
  if (d.pill)
    parts.push(
      `pill ${d.pill.number} ${pillStatus(d.pill, d.date, today)}`,
    );
  if (d.off) parts.push(`break day ${d.off}`);
  if (d.ovulation) parts.push("ovulation estimated");
  else if (d.fertile) parts.push("fertile window");
  if (d.logged) parts.push("logged");
  return parts.join(", ");
}
