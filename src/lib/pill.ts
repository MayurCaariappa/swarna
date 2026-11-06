import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";

// Pure pack-schedule maths. All dates are local calendar dates ("yyyy-MM-dd").

export interface PackConfig {
  packStart: string; // first pill of any pack; later packs repeat from here
  activeDays: number;
  breakDays: number;
  /** Learned from her logged bleeds (see calibrateBleed); defaults used if absent. */
  bleedOffset?: number; // 0-based off day the bleed usually starts on
  bleedLength?: number;
}

export interface PackDayInfo {
  kind: "before" | "active" | "off";
  /** 1-based pill number (active) or off-day number (off). 0 for "before". */
  number: number;
  packNumber: number; // 0 = the pack that started on packStart
  packStart: Date;
  breakStart: Date; // first off day of this pack
  nextPackStart: Date;
  daysUntilStart: number; // only meaningful for "before"
}

// Withdrawal bleeds usually begin a couple of days into the break. These
// defaults are used until calibrateBleed() has learned her own timing.
export const BLEED_START_OFFSET = 2; // off day 3
export const BLEED_LENGTH = 4;

/** [first off-day index, length] of the expected bleed, clamped to the break. */
function bleedWindow(cfg: PackConfig): [number, number] {
  if (cfg.breakDays === 0) return [0, 0];
  const start = Math.min(
    cfg.bleedOffset ?? BLEED_START_OFFSET,
    cfg.breakDays - 1,
  );
  return [
    start,
    Math.min(cfg.bleedLength ?? BLEED_LENGTH, cfg.breakDays - start),
  ];
}

export const toISODate = (d: Date) => format(d, "yyyy-MM-dd");

export function packDay(cfg: PackConfig, date: Date): PackDayInfo {
  const start = parseISO(cfg.packStart);
  const cycle = cfg.activeDays + cfg.breakDays;
  const since = differenceInCalendarDays(date, start);

  if (since < 0) {
    return {
      kind: "before",
      number: 0,
      packNumber: -1,
      packStart: start,
      breakStart: addDays(start, cfg.activeDays),
      nextPackStart: start,
      daysUntilStart: -since,
    };
  }

  const packNumber = Math.floor(since / cycle);
  const dayInPack = since % cycle; // 0-based
  const packStart = addDays(start, packNumber * cycle);
  const breakStart = addDays(packStart, cfg.activeDays);
  const nextPackStart = addDays(packStart, cycle);
  const active = dayInPack < cfg.activeDays;

  return {
    kind: active ? "active" : "off",
    number: active ? dayInPack + 1 : dayInPack - cfg.activeDays + 1,
    packNumber,
    packStart,
    breakStart,
    nextPackStart,
    daysUntilStart: 0,
  };
}

export interface StripDay {
  date: string;
  kind: "active" | "off";
  number: number;
  predictedBleed: boolean;
}

/** Every day of the pack that starts on packStart. */
export function packDays(cfg: PackConfig, packStart: Date): StripDay[] {
  const days: StripDay[] = [];
  const [bleedStart, bleedLen] = bleedWindow(cfg);
  for (let i = 0; i < cfg.activeDays + cfg.breakDays; i++) {
    const active = i < cfg.activeDays;
    const offIndex = i - cfg.activeDays;
    days.push({
      date: toISODate(addDays(packStart, i)),
      kind: active ? "active" : "off",
      number: active ? i + 1 : offIndex + 1,
      predictedBleed:
        !active && offIndex >= bleedStart && offIndex < bleedStart + bleedLen,
    });
  }
  return days;
}

/** Expected withdrawal bleed for the pack containing `info` (null if no break). */
export function expectedBleed(info: PackDayInfo, cfg: PackConfig) {
  const [offset, length] = bleedWindow(cfg);
  if (length === 0) return null;
  const start = addDays(info.breakStart, offset);
  return { start, end: addDays(start, length - 1) };
}

/** Is this day inside the expected withdrawal-bleed window of its pack? */
export function isPredictedBleedDay(
  cfg: PackConfig,
  info: PackDayInfo,
): boolean {
  if (info.kind !== "off") return false;
  const [start, length] = bleedWindow(cfg);
  const offIndex = info.number - 1;
  return offIndex >= start && offIndex < start + length;
}

/** The next expected withdrawal bleed that hasn't finished yet (this pack's or the next). */
export function nextPillBleed(cfg: PackConfig, today: Date) {
  const info = packDay(cfg, today);
  const current = expectedBleed(info, cfg);
  if (current && differenceInCalendarDays(current.end, today) >= 0)
    return current;
  return expectedBleed(packDay(cfg, info.nextPackStart), cfg);
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

/**
 * Learn when her withdrawal bleed usually starts and how long it lasts, from
 * bleeds logged around her breaks (last 6). Needs at least 2; otherwise the
 * defaults stay. Mirrored on the server in supabase/functions/_shared/pack.ts.
 */
/**
 * On the pill: is a bleed that started on `start` the break-week (withdrawal)
 * bleed, or breakthrough bleeding during the active pills? A bleed that starts
 * in the break or in the last 2 active days counts as withdrawal. "unknown" =
 * before the pack dates she entered.
 */
export function bleedKind(
  cfg: PackConfig,
  start: string,
): "withdrawal" | "breakthrough" | "unknown" {
  const pd = packDay(cfg, parseISO(start));
  if (pd.kind === "off") return "withdrawal";
  if (pd.kind === "active")
    return pd.number > cfg.activeDays - 3 ? "withdrawal" : "breakthrough";
  return "unknown";
}

export function calibrateBleed(
  cfg: PackConfig,
  periods: { start_date: string; end_date: string | null }[],
): PackConfig {
  const offsets: number[] = [];
  const lengths: number[] = [];
  for (const p of periods) {
    if (bleedKind(cfg, p.start_date) !== "withdrawal") continue; // breakthrough, or before tracking
    const pd = packDay(cfg, parseISO(p.start_date));
    const offset = pd.kind === "off" ? pd.number - 1 : 0; // 0 = started just before the break
    offsets.push(offset);
    if (p.end_date)
      lengths.push(
        differenceInCalendarDays(parseISO(p.end_date), parseISO(p.start_date)) +
          1,
      );
  }
  if (offsets.length < 2) return cfg;
  const recentLengths = lengths.slice(-6);
  return {
    ...cfg,
    bleedOffset: median(offsets.slice(-6)),
    bleedLength:
      recentLengths.length >= 2
        ? Math.min(Math.max(median(recentLengths), 2), 10)
        : cfg.bleedLength,
  };
}
