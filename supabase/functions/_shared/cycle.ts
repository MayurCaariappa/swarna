// Natural-cycle maths for the server. Mirrors src/lib/cycle.ts (keep in sync).
import { addDays, daysBetween } from "./pack.ts";

const DEFAULT_CYCLE = 28;
const MIN_CYCLE = 15;
const MAX_CYCLE = 60;
const RECENT = 6;

export interface Period {
  start_date: string;
  end_date: string | null;
}

/** Predicted next period start, or null with no periods. `periods` oldest first. */
export function predictNextStart(periods: Period[]): string | null {
  if (periods.length === 0) return null;
  const lengths: number[] = [];
  for (let i = 1; i < periods.length; i++) {
    const n = daysBetween(periods[i - 1].start_date, periods[i].start_date);
    if (n >= MIN_CYCLE && n <= MAX_CYCLE) lengths.push(n);
  }
  let avg = DEFAULT_CYCLE;
  if (lengths.length) {
    const recent = lengths.slice(-RECENT);
    let sum = 0;
    let weight = 0;
    recent.forEach((v, i) => {
      sum += v * (i + 1);
      weight += i + 1;
    });
    avg = Math.round(sum / weight);
  }
  return addDays(periods[periods.length - 1].start_date, avg);
}
