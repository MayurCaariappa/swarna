import { energyLabel, flowLabel, moodLabel, sexLabel, symptomLabel } from "../../lib/dailyLog";

/** Any day's log — her full entry or the partner's shared copy. */
interface LogLike {
  flow: string | null;
  symptoms: string[] | null;
  mood: string | null;
  energy: number | null;
  sex: string | null;
  notes: string | null;
  weight_kg?: number | null;
}

/** Compact read-only chips for a day's log (her Today card, partner views). */
export default function LogSummary({ log }: { log: LogLike }) {
  const items: string[] = [];
  const flow = flowLabel(log.flow);
  if (flow) items.push(`Flow: ${flow}`);
  const mood = moodLabel(log.mood);
  if (mood) items.push(mood);
  const energy = energyLabel(log.energy);
  if (energy) items.push(`Energy: ${energy}`);
  for (const s of log.symptoms ?? []) items.push(symptomLabel(s));
  const sex = sexLabel(log.sex);
  if (sex) items.push(`Sex: ${sex}`);
  if (log.weight_kg) items.push(`${log.weight_kg} kg`);

  return (
    <div className="stack" style={{ gap: 8 }}>
      {items.length > 0 && (
        <div className="chips">
          {items.map((t) => (
            <span key={t} className="chip">
              {t}
            </span>
          ))}
        </div>
      )}
      {log.notes?.trim() && <p className="small note-text">“{log.notes.trim()}”</p>}
    </div>
  );
}
