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
  // null = she hasn't touched the switch yet (see the default below).
  const [takenChoice, setTakenChoice] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  const okActive = Number.isInteger(active) && active >= 1 && active <= 365;
  const okBreak = Number.isInteger(brk) && brk >= 0 && brk <= 60;
  const problem = !start
    ? "Pick the date of the first pill."
    : !okActive
      ? "Active pills must be a whole number from 1 to 365."
      : !okBreak
        ? "Break days must be a whole number from 0 to 60."
        : "";
  const valid = !problem;
  const info = valid ? packDay({ packStart: start, activeDays: active, breakDays: brk }, parseISO(today)) : null;
  const startsInPast = valid && start < today;
  const future = valid && start > today;

  // Pills that "I've taken every pill up to yesterday" would mark.
  const backfill: string[] = [];
  if (startsInPast) {
    const cfg = { packStart: start, activeDays: active, breakDays: brk };
    const n = Math.min(differenceInCalendarDays(parseISO(today), parseISO(start)), 400);
    for (let i = 0; i < n; i++) {
      const d = addDays(parseISO(start), i);
      if (packDay(cfg, d).kind === "active") backfill.push(toISODate(d));
    }
  }
  // On by default only within the current pack; for older dates she has to choose.
  const withinOnePack =
    startsInPast && differenceInCalendarDays(parseISO(today), parseISO(start)) < active + brk;
  const alreadyTaken = takenChoice ?? withinOnePack;

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
    if (startsInPast && alreadyTaken && backfill.length)
      await markPillsTaken(ownerId, backfill);
  }

  return (
    <section className="card stack">
      <h2>Set up your pill pack</h2>

      <label>
        {future
          ? "First pill of your new pack will be taken on"
          : "First pill of your current pack was taken on"}
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

      {startsInPast && backfill.length > 0 && (
        <label className="toggle-row">
          <span>
            I've taken every pill up to yesterday
            <span className="muted small block">
              Marks {backfill.length} pill{backfill.length === 1 ? "" : "s"} as taken, from{" "}
              {format(parseISO(backfill[0]), "d MMM yyyy")}. You can unmark any later.
            </span>
          </span>
          <input type="checkbox" className="switch" checked={alreadyTaken} onChange={(e) => setTakenChoice(e.target.checked)} />
        </label>
      )}

      {problem && <p className="error small">{problem}</p>}
      {preview && <p className="info">{preview}</p>}

      <button className="btn primary" disabled={!valid || busy} onClick={save}>
        Start tracking
      </button>
    </section>
  );
}
