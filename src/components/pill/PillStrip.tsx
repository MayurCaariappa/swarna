import { format, parseISO } from "date-fns";
import type { PillLogRow } from "../../data/db";
import { setPillTaken } from "../../data/actions";
import type { StripDay } from "../../lib/pill";

interface Props {
  ownerId: string;
  days: StripDay[];
  logs: Map<string, PillLogRow> | undefined;
  today: string;
}

/** The pill-strip grid: taken / missed / today / upcoming / off days. */
export default function PillStrip({ ownerId, days, logs, today }: Props) {
  return (
    <div className="strip" role="group" aria-label="Pill strip">
      {days.map((d) => {
        const taken = logs?.has(d.date) ?? false;
        const past = d.date < today;
        const isToday = d.date === today;
        const state =
          d.kind === "off" ? "off" : taken ? "taken" : past ? "missed" : isToday ? "today" : "upcoming";
        const canToggle = d.kind === "active" && d.date <= today;
        const said = { off: d.predictedBleed ? "bleed expected" : "break", taken: "taken", missed: "not marked", today: "not taken yet", upcoming: "upcoming" }[state];
        const label = `${d.kind === "active" ? `Pill ${d.number}` : `Break day ${d.number}`}, ${format(parseISO(d.date), "EEE d MMM")}, ${said}`;

        return (
          <button
            key={d.date}
            className={`pill ${state}${isToday ? " is-today" : ""}${d.predictedBleed ? " bleed" : ""}`}
            disabled={!canToggle}
            aria-label={label}
            title={label}
            onClick={() => setPillTaken(ownerId, d.date, !taken)}
          >
            {state === "taken" ? "✓" : state === "missed" ? "!" : d.kind === "active" ? d.number : ""}
          </button>
        );
      })}
    </div>
  );
}

export function StripLegend() {
  return (
    <div className="legend small muted">
      <span><i className="pill taken" /> taken</span>
      <span><i className="pill missed" /> not marked</span>
      <span><i className="pill upcoming" /> upcoming</span>
      <span><i className="pill off" /> break</span>
      <span><i className="pill off bleed" /> break · bleed expected</span>
    </div>
  );
}
