import { format, parseISO } from "date-fns";
import { useState } from "react";

const W = 340;
const H = 160;
const PAD = { top: 14, right: 10, bottom: 22, left: 34 };

/** Weight over time: one line, tap or hover for exact values. */
export default function WeightChart({
  points,
}: {
  points: { date: string; kg: number }[];
}) {
  const [sel, setSel] = useState(points.length - 1);
  if (points.length === 0) return null;

  const t0 = parseISO(points[0].date).getTime();
  const t1 = parseISO(points[points.length - 1].date).getTime();
  const span = Math.max(t1 - t0, 1);
  const kgs = points.map((p) => p.kg);
  const lo = Math.floor(Math.min(...kgs) - 1);
  const hi = Math.ceil(Math.max(...kgs) + 1);

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (d: string) =>
    points.length === 1
      ? PAD.left + plotW / 2
      : PAD.left + ((parseISO(d).getTime() - t0) / span) * plotW;
  const y = (kg: number) => PAD.top + plotH - ((kg - lo) / (hi - lo)) * plotH;
  const path = points
    .map((p, i) => `${i ? "L" : "M"}${x(p.date)},${y(p.kg)}`)
    .join(" ");
  const chosen = points[sel] ?? points[points.length - 1];

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Weight over time">
        {[lo, hi].map((v) => (
          <g key={v}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(v)}
              y2={y(v)}
              className="grid"
            />
            <text
              x={PAD.left - 6}
              y={y(v) + 3}
              className="axis"
              textAnchor="end"
            >
              {v}
            </text>
          </g>
        ))}
        <path d={path} className="line-lilac" />
        {points.map((p, i) => (
          <g key={p.date}>
            <circle
              cx={x(p.date)}
              cy={y(p.kg)}
              r={i === sel ? 5 : 3}
              className={i === sel ? "pt on" : "pt"}
            />
            <circle
              cx={x(p.date)}
              cy={y(p.kg)}
              r={12}
              fill="transparent"
              onClick={() => setSel(i)}
              onPointerEnter={() => setSel(i)}
            >
              <title>{`${format(parseISO(p.date), "d MMM")}: ${p.kg} kg`}</title>
            </circle>
          </g>
        ))}
        <text x={PAD.left} y={H - 6} className="axis">
          {format(parseISO(points[0].date), "d MMM")}
        </text>
        {points.length > 1 && (
          <text x={W - PAD.right} y={H - 6} className="axis" textAnchor="end">
            {format(parseISO(points[points.length - 1].date), "d MMM")}
          </text>
        )}
      </svg>
      <p className="chart-readout small">
        <strong>{format(parseISO(chosen.date), "d MMM yyyy")}</strong> ·{" "}
        {chosen.kg} kg
      </p>
    </div>
  );
}
