import { ChevronLeft, ChevronRight } from "lucide-react";
import { addMonths, format, parseISO } from "date-fns";
import { useRef } from "react";
import { pillStatus, type DayInfo } from "../../lib/calendarDays";

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
  pillMode: boolean;
  showPills: boolean;
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
  pillMode,
  showPills,
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

  return (
    <>
      <div className="cal-head">
        <button
          className="icon-btn"
          onClick={() => onMonthChange(addMonths(month, -1))}
          aria-label="Previous month"
        >
          <ChevronLeft size={18} />
        </button>
        <div className="cal-title">
          <h1 aria-live="polite">{format(month, "MMMM yyyy")}</h1>
          {/* Always in the layout (hidden when not needed) so the title never shifts. */}
          <button
            className="today-btn"
            onClick={onToday}
            style={atToday ? { visibility: "hidden" } : undefined}
          >
            Today
          </button>
        </div>
        <button
          className="icon-btn"
          onClick={() => onMonthChange(addMonths(month, 1))}
          aria-label="Next month"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      <div
        className="card cal-card stack"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div className="cal">
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

        <div className="legend small muted">
          <span>
            <i className="sw bleed" /> period
          </span>
          <span>
            <i className="sw predicted" /> predicted
          </span>
          <span>
            <i className="log-mark" /> logged
          </span>
          {pillMode ? (
            <>
              {showPills && (
                <>
                  <span>
                    <i className="dot taken" /> pill taken
                  </span>
                  <span>
                    <i className="dot missed" /> not marked
                  </span>
                </>
              )}
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
