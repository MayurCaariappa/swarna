import { format, parseISO } from "date-fns";
import { useEffect, useRef, useState } from "react";
import { saveDailyLog } from "../../data/actions";
import { EMPTY_DAILY_LOG, type DailyLogFields } from "../../data/db";
import { useDailyLog } from "../../data/hooks";
import {
  DISCHARGE,
  ENERGY,
  EXERCISE,
  EXERCISE_TYPES,
  FLOWS,
  MOODS,
  SEX,
  SYMPTOMS,
} from "../../lib/dailyLog";

interface Props {
  ownerId: string;
  date: string;
  onClose: () => void;
}

/** Full-screen sheet: tap to log a day. Every tap saves; nothing is required. */
export default function DailyLogSheet({ ownerId, date, onClose }: Props) {
  const row = useDailyLog(ownerId, date);
  const log: DailyLogFields = row
    ? { ...EMPTY_DAILY_LOG, ...row }
    : EMPTY_DAILY_LOG;
  const save = (patch: Partial<DailyLogFields>) =>
    saveDailyLog(ownerId, date, patch);

  // Tap the selected option again to clear it.
  const pick = <K extends keyof DailyLogFields>(
    key: K,
    value: DailyLogFields[K],
  ) =>
    save({
      [key]: log[key] === value ? null : value,
    } as Partial<DailyLogFields>);

  const toggleSymptom = (s: string) =>
    save({
      symptoms: log.symptoms.includes(s)
        ? log.symptoms.filter((x) => x !== s)
        : [...log.symptoms, s],
    });

  // Picking a workout type on a blank day also implies "not a rest day".
  const toggleExerciseType = (t: string) => {
    const types = log.exercise_types.includes(t)
      ? log.exercise_types.filter((x) => x !== t)
      : [...log.exercise_types, t];
    save({
      exercise_types: types,
      ...(types.length && log.exercise === "rest" ? { exercise: null } : {}),
    });
  };
  const pickExercise = (v: (typeof EXERCISE)[number]["value"]) =>
    save(
      v === "rest" && log.exercise !== "rest"
        ? { exercise: "rest", exercise_types: [] } // a rest day has no workouts
        : { exercise: log.exercise === v ? null : v },
    );

  // Text fields save shortly after typing stops, and on close.
  const [notes, setNotes] = useState("");
  const [weight, setWeight] = useState("");
  const loaded = useRef(false);
  useEffect(() => {
    if (row !== undefined && !loaded.current) {
      loaded.current = true;
      setNotes(row?.notes ?? "");
      setWeight(row?.weight_kg != null ? String(row.weight_kg) : "");
    }
  }, [row]);

  const validWeight = (v: string) => {
    const n = Number(v);
    return v.trim() !== "" && Number.isFinite(n) && n >= 20 && n <= 300;
  };
  const weightError = weight !== "" && !validWeight(weight);

  const pending = useRef<Partial<DailyLogFields>>({});
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const flush = () => {
    clearTimeout(timer.current);
    if (Object.keys(pending.current).length) {
      void save(pending.current);
      pending.current = {};
    }
  };
  const queue = (patch: Partial<DailyLogFields>) => {
    pending.current = { ...pending.current, ...patch };
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 600);
  };

  function close() {
    flush();
    onClose();
  }

  // Close with the hardware/browser back button.
  useEffect(() => {
    history.pushState({ sheet: true }, "");
    const onPop = () => close();
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (row === undefined) return null;

  return (
    <div
      className="sheet"
      role="dialog"
      aria-modal="true"
      aria-label="Daily log"
    >
      <div className="sheet-head">
        <h2>{format(parseISO(date), "EEEE d MMMM")}</h2>
        <button className="btn link" onClick={() => history.back()}>
          Done
        </button>
      </div>

      <div className="sheet-body stack">
        <Group title="Flow">
          {FLOWS.map((o) => (
            <Chip
              key={o.value}
              on={log.flow === o.value}
              onClick={() => pick("flow", o.value)}
            >
              {o.label}
            </Chip>
          ))}
        </Group>

        <Group title="Symptoms">
          {SYMPTOMS.map((o) => (
            <Chip
              key={o.value}
              on={log.symptoms.includes(o.value)}
              onClick={() => toggleSymptom(o.value)}
            >
              {o.label}
            </Chip>
          ))}
        </Group>

        <Group title="Mood">
          {MOODS.map((o) => (
            <Chip
              key={o.value}
              on={log.mood === o.value}
              onClick={() => pick("mood", o.value)}
            >
              <span className="emoji">{o.emoji}</span> {o.label}
            </Chip>
          ))}
        </Group>

        <Group title="Energy">
          {ENERGY.map((o) => (
            <Chip
              key={o.value}
              on={log.energy === o.value}
              onClick={() => pick("energy", o.value)}
            >
              <span className="meter" aria-hidden>
                {[1, 2, 3, 4].map((n) => (
                  <i key={n} className={n <= o.value ? "on" : ""} />
                ))}
              </span>
              {o.label}
            </Chip>
          ))}
        </Group>

        <Group title="Exercise">
          {EXERCISE.map((o) => (
            <Chip
              key={o.value}
              on={log.exercise === o.value}
              onClick={() => pickExercise(o.value)}
            >
              {o.label}
            </Chip>
          ))}
        </Group>
        {log.exercise !== "rest" && (
          <div className="chip-row sub-row" aria-label="Type of exercise">
            {EXERCISE_TYPES.map((o) => (
              <Chip
                key={o.value}
                on={log.exercise_types.includes(o.value)}
                onClick={() => toggleExerciseType(o.value)}
              >
                {o.label}
              </Chip>
            ))}
          </div>
        )}

        <Group title="Discharge" hint="Private — never shared">
          {DISCHARGE.map((o) => (
            <Chip
              key={o.value}
              on={log.discharge === o.value}
              onClick={() => pick("discharge", o.value)}
            >
              {o.label}
            </Chip>
          ))}
        </Group>

        <Group title="Sex">
          {SEX.map((o) => (
            <Chip
              key={o.value}
              on={log.sex === o.value}
              onClick={() => pick("sex", o.value)}
            >
              {o.label}
            </Chip>
          ))}
        </Group>

        <label>
          <span className="group-title">
            Weight <span className="muted small">(kg · private)</span>
          </span>
          <input
            type="number"
            inputMode="decimal"
            step="0.1"
            min={20}
            max={300}
            placeholder="e.g. 58.5"
            value={weight}
            aria-invalid={weightError ? true : undefined}
            aria-describedby={weightError ? "weight-error" : undefined}
            onChange={(e) => {
              setWeight(e.target.value);
              const n = Number(e.target.value);
              if (e.target.value === "") queue({ weight_kg: null });
              else if (validWeight(e.target.value))
                queue({ weight_kg: Math.round(n * 10) / 10 });
              else delete pending.current.weight_kg; // never save a half-typed or impossible value
            }}
          />
          {weightError && (
            <span id="weight-error" className="error small">
              Enter a weight between 20 and 300 kg — this one isn't saved.
            </span>
          )}
        </label>

        <label>
          <span className="group-title">Notes</span>
          <textarea
            rows={4}
            maxLength={4000}
            placeholder="Anything else about today"
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
              queue({ notes: e.target.value.trim() ? e.target.value : null });
            }}
          />
        </label>

        <p className="muted small center">
          Saved automatically. Tap a selected option again to clear it.
        </p>
      </div>
    </div>
  );
}

function Group({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="group">
      <p className="group-title">
        {title} {hint && <span className="muted small">({hint})</span>}
      </p>
      <div className="chip-row">{children}</div>
    </div>
  );
}

function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`tap-chip ${on ? "on" : ""}`}
      aria-pressed={on}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
