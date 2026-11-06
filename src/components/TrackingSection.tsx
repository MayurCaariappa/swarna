import { useAuth } from "../auth/AuthProvider";
import { saveTracking } from "../data/actions";
import { useConfirm } from "./ui/Confirm";
import { DEFAULT_TRACKING, type TrackingRow } from "../data/db";

/** Settings → Tracking: pill vs natural mode, pack schedule, reminder time. */
/** `tracking` is loaded by the Settings page so the whole page appears at once. */
export default function TrackingSection({
  tracking,
}: {
  tracking: TrackingRow | null;
}) {
  const { session } = useAuth();
  const ownerId = session!.user.id;
  const confirm = useConfirm();

  const t = tracking ?? { ...DEFAULT_TRACKING, owner_id: ownerId };
  const save = (patch: Parameters<typeof saveTracking>[1]) =>
    saveTracking(ownerId, patch);

  async function setMode(mode: "pill" | "natural") {
    if (mode === t.mode) return;
    if (
      mode === "natural" &&
      !(await confirm({
        title: "Switch to natural cycle mode?",
        message:
          "The first cycles after stopping the pill can be irregular, so predictions will take a few cycles to settle. Your pill history is kept.",
        action: "Switch",
      }))
    )
      return;
    save(
      mode === "natural"
        ? { mode, natural_since: new Date().toLocaleDateString("en-CA") }
        : { mode },
    );
  }

  const num = (v: string, min: number, max: number) => {
    const n = Number(v);
    return Number.isInteger(n) && n >= min && n <= max ? n : null;
  };

  return (
    <section className="card stack">
      <h2>Tracking</h2>

      <div className="segmented">
        <button
          className={t.mode === "pill" ? "on" : ""}
          onClick={() => setMode("pill")}
        >
          On the pill
        </button>
        <button
          className={t.mode === "natural" ? "on" : ""}
          onClick={() => setMode("natural")}
        >
          Natural cycle
        </button>
      </div>

      {t.mode === "pill" && (
        <>
          <label>
            First pill of a pack (any pack — later packs follow on)
            <input
              type="date"
              value={t.pack_start_date ?? ""}
              onChange={(e) =>
                e.target.value && save({ pack_start_date: e.target.value })
              }
            />
          </label>
          <div className="row">
            <label>
              Active pills
              <input
                type="number"
                inputMode="numeric"
                defaultValue={t.active_days}
                onChange={(e) => {
                  const n = num(e.target.value, 1, 365);
                  if (n !== null) save({ active_days: n });
                }}
              />
            </label>
            <label>
              Break days
              <input
                type="number"
                inputMode="numeric"
                defaultValue={t.break_days}
                onChange={(e) => {
                  const n = num(e.target.value, 0, 60);
                  if (n !== null) save({ break_days: n });
                }}
              />
            </label>
          </div>
          <label>
            Reminder time
            <input
              type="time"
              value={t.reminder_time.slice(0, 5)}
              onChange={(e) =>
                e.target.value && save({ reminder_time: e.target.value })
              }
            />
          </label>
          <p className="muted small">
            Turn on reminders below. Keep your current alarm for the first 2–3
            weeks until Swarna's reminders have proven reliable.
          </p>
        </>
      )}
    </section>
  );
}
