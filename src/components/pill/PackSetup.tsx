import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import { useState } from "react";
import { markPillsTaken, saveTracking } from "../../data/actions";
import { packDay, toISODate } from "../../lib/pill";

/** First-run: tell the app where she is in her pack. */
export default function PackSetup({ ownerId, today }: { ownerId: string; today: string }) {
  const [start, setStart] = useState(today);
  const [active, setActive] = useState(21);
  const [brk, setBrk] = useState(7);
  const [reminder, setReminder] = useState("21:00");
  const [alreadyTaken, setAlreadyTaken] = useState(true);
  const [busy, setBusy] = useState(false);

  const valid = Boolean(start) && active >= 1 && active <= 365 && brk >= 0 && brk <= 60;
  const info = valid ? packDay({ packStart: start, activeDays: active, breakDays: brk }, parseISO(today)) : null;
  const startsInPast = valid && start < today;

  const preview = !info
    ? ""
    : info.kind === "before"
      ? `Pack starts ${format(parseISO(start), "EEE d MMM")}`
      : info.kind === "active"
        ? `Today is pill ${info.number} of ${active}`
        : `Today is off day ${info.number} of ${brk}`;

  async function save() {
    if (!valid) return;
    setBusy(true);
    await saveTracking(ownerId, {
      mode: "pill",
      pack_start_date: start,
      active_days: active,
      break_days: brk,
      reminder_time: reminder,
    });
    if (startsInPast && alreadyTaken) {
      // Mark every active pill day from the start date up to yesterday.
      const cfg = { packStart: start, activeDays: active, breakDays: brk };
      const days = Math.min(differenceInCalendarDays(parseISO(today), parseISO(start)), 400);
      const dates: string[] = [];
      for (let i = 0; i < days; i++) {
        const d = addDays(parseISO(start), i);
        if (packDay(cfg, d).kind === "active") dates.push(toISODate(d));
      }
      if (dates.length) await markPillsTaken(ownerId, dates);
    }
  }

  return (
    <section className="card stack">
      <h2>Set up your pill pack</h2>

      <label>
        First pill of your current pack was taken on
        <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
      </label>

      <div className="row">
        <label>
          Active pills
          <input type="number" inputMode="numeric" min={1} max={365} value={active} onChange={(e) => setActive(Number(e.target.value))} />
        </label>
        <label>
          Break days
          <input type="number" inputMode="numeric" min={0} max={60} value={brk} onChange={(e) => setBrk(Number(e.target.value))} />
        </label>
      </div>

      <label>
        Reminder time
        <input type="time" value={reminder} onChange={(e) => setReminder(e.target.value)} />
      </label>

      {startsInPast && (
        <label className="toggle-row">
          <span>I've taken every pill up to yesterday</span>
          <input type="checkbox" className="switch" checked={alreadyTaken} onChange={(e) => setAlreadyTaken(e.target.checked)} />
        </label>
      )}

      {preview && <p className="info">{preview}</p>}

      <button className="btn primary" disabled={!valid || busy} onClick={save}>
        Start tracking
      </button>
    </section>
  );
}
