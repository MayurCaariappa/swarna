import { differenceInCalendarDays, parseISO } from "date-fns";
import type { Prediction } from "./cycle";
import { packDay, type PackConfig } from "./pill";

// Short, gentle, non-medical phase descriptions for the partner view.

export interface Phase {
  label: string;
  tip: string;
}

export const BLEEDING: Phase = {
  label: "Bleeding",
  tip: "Cramps and tiredness are common now. Warmth, rest and snacks help.",
};

export function pillPhase(
  cfg: PackConfig,
  today: Date,
  bleeding: boolean,
): Phase {
  if (bleeding) return BLEEDING;
  const pd = packDay(cfg, today);
  if (pd.kind === "before")
    return { label: "Before the pack", tip: "A new pack starts soon." };
  if (pd.kind === "off")
    return {
      label: "Break week",
      tip: "No pills this week. A withdrawal bleed usually comes a few days in.",
    };
  if (pd.number > cfg.activeDays - 3)
    return {
      label: "End of the pack",
      tip: "The break is close. Some people feel a bit low or bloated just before.",
    };
  return {
    label: "Active pills",
    tip: "Usually a steadier stretch of the month.",
  };
}

export function naturalPhase(
  p: Prediction,
  today: string,
  bleeding: boolean,
): Phase {
  if (bleeding) return { ...BLEEDING, label: "Period" };
  if (p.daysLate > 0)
    return {
      label: "Period late",
      tip: "Later than predicted. Predictions are estimates and cycles vary.",
    };
  const until = differenceInCalendarDays(
    parseISO(p.nextStart),
    parseISO(today),
  );
  if (until <= 5)
    return {
      label: "PMS window",
      tip: "Energy may be lower and mood may dip. Extra kindness goes a long way.",
    };
  if (today >= p.fertileStart && today <= p.fertileEnd)
    return {
      label: "Around ovulation",
      tip: "Energy and mood often peak around now.",
    };
  if (today < p.fertileStart)
    return {
      label: "After the period",
      tip: "Energy often rises in this part of the cycle.",
    };
  return {
    label: "Second half of the cycle",
    tip: "Things may slow down a little as the cycle goes on.",
  };
}
