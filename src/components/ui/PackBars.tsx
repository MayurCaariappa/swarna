export type BarState =
  | "done"
  | "now"
  | "nowdone" // today, already taken
  | "todo"
  | "brk"
  | "bleed"
  | "fert"
  | "miss";

/** One bar per day of the pack or cycle (the Bento progress strip). */
export default function PackBars({
  bars,
  label,
}: {
  bars: BarState[];
  label: string;
}) {
  return (
    <div className="packbars" role="img" aria-label={label}>
      {bars.map((b, i) => (
        <span key={i} className={`pb ${b}`} />
      ))}
    </div>
  );
}
