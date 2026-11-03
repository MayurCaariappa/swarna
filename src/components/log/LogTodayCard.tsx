import { useState } from "react";
import { useDailyLog, hasContent } from "../../data/hooks";
import DailyLogSheet from "./DailyLogSheet";
import LogSummary from "./LogSummary";

/** Today: summary of today's log + button to open the sheet. */
export default function LogTodayCard({ ownerId, today }: { ownerId: string; today: string }) {
  const log = useDailyLog(ownerId, today);
  const [open, setOpen] = useState(false);
  const logged = log && !log.deleted && hasContent(log);

  return (
    <>
      <section className="card stack">
        <div className="row-between">
          <h2>How are you today?</h2>
          {logged && (
            <button className="btn link" onClick={() => setOpen(true)}>
              Edit
            </button>
          )}
        </div>
        {logged ? (
          <LogSummary log={log} />
        ) : (
          <button className="btn primary" onClick={() => setOpen(true)}>
            Log today
          </button>
        )}
      </section>
      {open && <DailyLogSheet ownerId={ownerId} date={today} onClose={() => setOpen(false)} />}
    </>
  );
}
