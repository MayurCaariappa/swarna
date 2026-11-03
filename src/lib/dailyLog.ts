// Labels for the daily log, shared by her screens and the partner's.

export const FLOWS = [
  { value: "spotting", label: "Spotting" },
  { value: "light", label: "Light" },
  { value: "medium", label: "Medium" },
  { value: "heavy", label: "Heavy" },
] as const;

export const SYMPTOMS = [
  { value: "cramps", label: "Cramps" },
  { value: "headache", label: "Headache" },
  { value: "bloating", label: "Bloating" },
  { value: "acne", label: "Acne" },
  { value: "tender_breasts", label: "Tender breasts" },
  { value: "back_pain", label: "Back pain" },
  { value: "fatigue", label: "Fatigue" },
  { value: "hair_changes", label: "Hair changes" },
] as const;

export const MOODS = [
  { value: "happy", emoji: "😊", label: "Happy" },
  { value: "calm", emoji: "😌", label: "Calm" },
  { value: "okay", emoji: "😐", label: "Okay" },
  { value: "low", emoji: "😔", label: "Low" },
  { value: "sad", emoji: "😢", label: "Sad" },
  { value: "irritable", emoji: "😠", label: "Irritable" },
] as const;

export const ENERGY = [
  { value: 1, label: "Low" },
  { value: 2, label: "OK" },
  { value: 3, label: "Good" },
  { value: 4, label: "High" },
] as const;

export const DISCHARGE = [
  { value: "none", label: "None" },
  { value: "sticky", label: "Sticky" },
  { value: "creamy", label: "Creamy" },
  { value: "watery", label: "Watery" },
  { value: "egg-white", label: "Egg-white" },
] as const;

export const SEX = [
  { value: "none", label: "No" },
  { value: "protected", label: "Protected" },
  { value: "unprotected", label: "Unprotected" },
] as const;

const find = <T extends { value: unknown }>(list: readonly T[], v: unknown) => list.find((x) => x.value === v);

export const flowLabel = (v: string | null) => find(FLOWS, v)?.label ?? null;
export const symptomLabel = (v: string) => find(SYMPTOMS, v)?.label ?? v;
export const moodLabel = (v: string | null) => {
  const m = find(MOODS, v);
  return m ? `${m.emoji} ${m.label}` : null;
};
export const energyLabel = (v: number | null) => find(ENERGY, v)?.label ?? null;
export const sexLabel = (v: string | null) => find(SEX, v)?.label ?? null;
