import { PenLine } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { hasContent, useDailyLog } from "../../data/hooks";
import { MOODS } from "../../lib/dailyLog";
import DailyLogSheet from "./DailyLogSheet";

/** Today tile: how she feels, one tap into the daily log. */
export default function LogTodayCard({
  ownerId,
  today,
}: {
  ownerId: string;
  today: string;
}) {
  const log = useDailyLog(ownerId, today);
  const [open, setOpen] = useState(false);
  const logged = log && !log.deleted && hasContent(log);

  let value = "How are you?";
  let note = "";
  if (logged) {
    const mood = MOODS.find((m) => m.value === log.mood);
    value = mood ? `${mood.emoji} ${mood.label}` : "Logged ✓";
    const n = log.symptoms.length;
    note = n ? `${n} symptom${n === 1 ? "" : "s"}` : log.flow ? `${log.flow[0].toUpperCase()}${log.flow.slice(1)} flow` : "";
  }

  return (
    <>
      <section className="tile blk-mint" aria-label="Today's log">
        <div className="tile-icon">
          <PenLine size={18} />
        </div>
        <p className="tile-label">Today</p>
        <p className="tile-value">{value}</p>
        {note && <p className="tile-note">{note}</p>}
        <div className="tile-actions">
          <button
            className={`btn sm ${logged ? "white" : "ink"}`}
            onClick={() => setOpen(true)}
          >
            {logged ? "Edit log" : "Log today"}
          </button>
          <Link to="/calendar" className="btn link xs">
            Another day
          </Link>
        </div>
      </section>
      {open && (
        <DailyLogSheet
          ownerId={ownerId}
          date={today}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
