import { useState } from "react";
import { deletePeriod, restorePeriod, savePeriod } from "../../data/actions";
import { useToast } from "../ui/Toast";
import type { PeriodRow } from "../../data/db";
import { periodEnd } from "../../lib/cycle";
import { useConfirm } from "../ui/Confirm";

interface Props {
  ownerId: string;
  period: PeriodRow | null; // null = new
  defaultStart?: string;
  all: PeriodRow[];
  today: string;
  onDone: () => void;
}

/** Add or edit a period with explicit start / end dates. */
export default function PeriodEditor({
  ownerId,
  period,
  defaultStart,
  all,
  today,
  onDone,
}: Props) {
  const [start, setStart] = useState(
    period?.start_date ?? defaultStart ?? today,
  );
  const [ongoing, setOngoing] = useState(
    period ? period.end_date === null : (defaultStart ?? today) >= today,
  );
  const [end, setEnd] = useState(period?.end_date ?? defaultStart ?? today);
  const confirm = useConfirm();
  const toast = useToast();

  const finalEnd = ongoing ? null : end;
  const overlap = all.find(
    (p) =>
      p.id !== period?.id &&
      p.start_date <= (finalEnd ?? today) &&
      start <= periodEnd(p, today),
  );
  const error = !start
    ? "Pick a start date"
    : start > today
      ? "Start can't be in the future"
      : finalEnd && finalEnd < start
        ? "End must be on or after the start"
        : finalEnd && finalEnd > today
          ? "End can't be in the future — switch on “Still bleeding” instead"
        : overlap
          ? "This overlaps another logged period"
          : "";

  async function save() {
    if (error) return;
    await savePeriod(ownerId, period?.id ?? null, start, finalEnd);
    toast(period ? "Period updated · saved" : "Period saved");
    onDone();
  }

  async function remove() {
    if (!period) return;
    const ok = await confirm({
      title: "Delete this period?",
      message: "It's removed from your calendar, stats and your partner's view.",
      action: "Delete",
      danger: true,
    });
    if (!ok) return;
    const before = { ...period };
    await deletePeriod(period);
    toast("Period deleted", () => restorePeriod(before));
    onDone();
  }

  return (
    <div className="stack">
      <div className="row">
        <label>
          Started
          <input
            type="date"
            value={start}
            max={today}
            onChange={(e) => setStart(e.target.value)}
          />
        </label>
        <label>
          Ended
          <input
            type="date"
            value={end}
            min={start}
            max={today}
            disabled={ongoing}
            onChange={(e) => setEnd(e.target.value)}
          />
        </label>
      </div>
      <label className="toggle-row">
        <span>Still bleeding</span>
        <input
          type="checkbox"
          className="switch"
          checked={ongoing}
          onChange={(e) => setOngoing(e.target.checked)}
        />
      </label>
      {error && <p className="error">{error}</p>}
      <div className="row">
        <button
          className="btn primary"
          disabled={Boolean(error)}
          onClick={save}
        >
          Save
        </button>
        <button className="btn" onClick={onDone}>
          Cancel
        </button>
      </div>
      {period && (
        <button className="btn link danger" onClick={remove}>
          Delete this period
        </button>
      )}
    </div>
  );
}
