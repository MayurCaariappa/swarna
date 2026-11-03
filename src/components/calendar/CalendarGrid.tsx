import { addMonths, format, parseISO } from "date-fns";
import type { DayInfo } from "../../lib/calendarDays";

interface Props {
  month: Date;
  onMonthChange: (m: Date) => void;
  days: DayInfo[];
  today: string;
  selected: string | null;
  onSelect: (date: string) => void;
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
  pillMode,
  showPills,
}: Props) {
  return (
    <>
      <div className="cal-head">
        <button
          className="btn link"
          onClick={() => onMonthChange(addMonths(month, -1))}
          aria-label="Previous month"
        >
          ‹
        </button>
        <h1>{format(month, "MMMM yyyy")}</h1>
        <button
          className="btn link"
          onClick={() => onMonthChange(addMonths(month, 1))}
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
            onClick={() => onSelect(d.date)}
          >
            {d.logged && <i className="log-mark" aria-label="logged" />}
            <span>{parseISO(d.date).getDate()}</span>
            {d.pill && (
              <i
                className={`dot ${d.pill.taken ? "taken" : d.pill.missed ? "missed" : ""}`}
              />
            )}
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
          <i className="log-mark legend-mark" /> logged
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
    </>
  );
}
