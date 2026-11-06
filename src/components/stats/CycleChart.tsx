import { format, parseISO } from "date-fns";
import { useState } from "react";
import type { CycleBar } from "../../lib/stats";

const W = 340;
const H = 180;
const PAD = { top: 16, right: 8, bottom: 22, left: 26 };

/** Last cycles as bars: bleed days (bottom) + rest of the cycle (top), with the average as a dashed line. */
export default function CycleChart({
  cycles,
  average,
}: {
  cycles: CycleBar[];
  average: number | null;
}) {
  const [sel, setSel] = useState<number>(cycles.length - 1);
  if (cycles.length === 0) return null;

  const max = Math.max(35, ...cycles.map((c) => c.length)) + 3;
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const slot = plotW / cycles.length;
  const barW = Math.min(22, slot * 0.6);
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
  const ticks = [0, 14, 28].filter((t) => t < max);
  const chosen = cycles[sel] ?? cycles[cycles.length - 1];

  return (
    <div className="chart">
      <div className="legend small muted">
        <span>
          <i className="sw chart-bleed" /> bleed days
        </span>
        <span>
          <i className="sw chart-lilac" /> rest of cycle
        </span>
        {average !== null && (
          <span>
            <i className="sw chart-avg" /> average
          </span>
        )}
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Cycle lengths for recent cycles"
      >
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(t)}
              y2={y(t)}
              className="grid"
            />
            <text
              x={PAD.left - 6}
              y={y(t) + 3}
              className="axis"
              textAnchor="end"
            >
              {t}
            </text>
          </g>
        ))}

        {cycles.map((c, i) => {
          const x = PAD.left + slot * i + (slot - barW) / 2;
          const bleed = Math.min(c.bleed ?? 0, c.length);
          const gap = bleed > 0 ? 2 : 0;
          const r = Math.min(4, barW / 2);
          return (
            <g key={c.start} className={i === sel ? "bar on" : "bar"}>
              {/* rest of cycle: rounded at the top */}
              <path
                className="fill-lilac"
                d={roundedTop(
                  x,
                  y(c.length),
                  barW,
                  y(bleed) - y(c.length) - gap,
                  r,
                )}
              />
              {bleed > 0 && (
                <rect
                  className="fill-bleed"
                  x={x}
                  y={y(bleed)}
                  width={barW}
                  height={y(0) - y(bleed)}
                />
              )}
              {/* bigger invisible hit target */}
              <rect
                x={PAD.left + slot * i}
                y={PAD.top}
                width={slot}
                height={plotH}
                fill="transparent"
                onClick={() => setSel(i)}
                onPointerEnter={() => setSel(i)}
              >
                <title>{`${format(parseISO(c.start), "d MMM")}: ${c.length}-day cycle${c.bleed ? `, ${c.bleed} bleed days` : ""}`}</title>
              </rect>
            </g>
          );
        })}

        {average !== null && (
          <g>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(average)}
              y2={y(average)}
              className="avg-line"
            />
            <text
              x={W - PAD.right}
              y={y(average) - 4}
              className="axis"
              textAnchor="end"
            >
              avg {average}
            </text>
          </g>
        )}

        {/* Start date under each bar (up to 6), else just the first and last. */}
        {cycles.map((c, i) =>
          cycles.length <= 6 || i === 0 || i === cycles.length - 1 ? (
            <text
              key={c.start}
              x={PAD.left + slot * i + slot / 2}
              y={H - 6}
              className="axis"
              textAnchor="middle"
            >
              {format(parseISO(c.start), "d MMM")}
            </text>
          ) : null,
        )}
      </svg>

      <p className="chart-readout small">
        <strong>{format(parseISO(chosen.start), "d MMM yyyy")}</strong> ·{" "}
        {chosen.length}-day cycle
        {chosen.bleed ? ` · bled ${chosen.bleed} days` : ""}
      </p>
    </div>
  );
}

function roundedTop(x: number, y: number, w: number, h: number, r: number) {
  if (h <= 0) return "";
  const rr = Math.min(r, h);
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
}
