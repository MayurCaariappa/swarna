import { parseISO } from "date-fns";
import { describe, expect, it } from "vitest";
import {
  BLEED_LENGTH,
  BLEED_START_OFFSET,
  bleedKind,
  calibrateBleed,
  expectedBleed,
  isPredictedBleedDay,
  nextPillBleed,
  packDay,
  packDays,
  toISODate,
  type PackConfig,
} from "./pill";

// Pack 0 runs Sun 1 Nov – Sat 21 Nov (pills), break Sun 22 – Sat 28 Nov.
const cfg: PackConfig = { packStart: "2026-11-01", activeDays: 21, breakDays: 7 };
const d = (iso: string) => parseISO(iso);

describe("toISODate", () => {
  it("formats a local date", () => {
    expect(toISODate(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("packDay", () => {
  it("is 'before' ahead of the first pack", () => {
    const info = packDay(cfg, d("2026-10-30"));
    expect(info).toMatchObject({ kind: "before", number: 0, packNumber: -1, daysUntilStart: 2 });
    expect(toISODate(info.breakStart)).toBe("2026-11-22");
    expect(toISODate(info.nextPackStart)).toBe("2026-11-01");
  });

  it("counts active pills from 1", () => {
    expect(packDay(cfg, d("2026-11-01"))).toMatchObject({ kind: "active", number: 1, packNumber: 0 });
    expect(packDay(cfg, d("2026-11-21"))).toMatchObject({ kind: "active", number: 21 });
  });

  it("counts break days from 1", () => {
    const info = packDay(cfg, d("2026-11-22"));
    expect(info).toMatchObject({ kind: "off", number: 1, daysUntilStart: 0 });
    expect(toISODate(info.nextPackStart)).toBe("2026-11-29");
    expect(packDay(cfg, d("2026-11-28"))).toMatchObject({ kind: "off", number: 7 });
  });

  it("repeats packs after the break", () => {
    const info = packDay(cfg, d("2026-11-29"));
    expect(info).toMatchObject({ kind: "active", number: 1, packNumber: 1 });
    expect(toISODate(info.packStart)).toBe("2026-11-29");
    expect(toISODate(info.breakStart)).toBe("2026-12-20");
  });
});

describe("packDays", () => {
  it("lists every day of the pack with the default bleed window", () => {
    const days = packDays(cfg, d("2026-11-01"));
    expect(days).toHaveLength(28);
    expect(days[0]).toEqual({ date: "2026-11-01", kind: "active", number: 1, predictedBleed: false });
    expect(days[21]).toMatchObject({ date: "2026-11-22", kind: "off", number: 1, predictedBleed: false });
    const bleed = days.filter((x) => x.predictedBleed).map((x) => x.date);
    expect(bleed).toEqual(["2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27"]);
    expect(BLEED_START_OFFSET).toBe(2);
    expect(BLEED_LENGTH).toBe(4);
  });

  it("predicts no bleed without a break", () => {
    const days = packDays({ ...cfg, activeDays: 28, breakDays: 0 }, d("2026-11-01"));
    expect(days.every((x) => x.kind === "active" && !x.predictedBleed)).toBe(true);
  });

  it("clamps a learned window to the break", () => {
    const days = packDays({ ...cfg, bleedOffset: 10, bleedLength: 5 }, d("2026-11-01"));
    expect(days.filter((x) => x.predictedBleed).map((x) => x.number)).toEqual([7]);
  });
});

describe("expectedBleed / isPredictedBleedDay / nextPillBleed", () => {
  it("gives this pack's bleed window", () => {
    const b = expectedBleed(packDay(cfg, d("2026-11-05")), cfg)!;
    expect(toISODate(b.start)).toBe("2026-11-24");
    expect(toISODate(b.end)).toBe("2026-11-27");
  });

  it("is null with no break", () => {
    const noBreak = { ...cfg, breakDays: 0 };
    expect(expectedBleed(packDay(noBreak, d("2026-11-05")), noBreak)).toBeNull();
    expect(nextPillBleed(noBreak, d("2026-11-05"))).toBeNull();
  });

  it("knows which break days are predicted", () => {
    expect(isPredictedBleedDay(cfg, packDay(cfg, d("2026-11-05")))).toBe(false);
    expect(isPredictedBleedDay(cfg, packDay(cfg, d("2026-11-22")))).toBe(false);
    expect(isPredictedBleedDay(cfg, packDay(cfg, d("2026-11-24")))).toBe(true);
    expect(isPredictedBleedDay(cfg, packDay(cfg, d("2026-11-28")))).toBe(false);
  });

  it("returns this pack's bleed until it has finished, then the next one", () => {
    const now = nextPillBleed(cfg, d("2026-11-27"))!;
    expect(toISODate(now.start)).toBe("2026-11-24");
    const next = nextPillBleed(cfg, d("2026-11-28"))!;
    expect(toISODate(next.start)).toBe("2026-12-22");
    expect(toISODate(next.end)).toBe("2026-12-25");
  });
});

describe("bleedKind", () => {
  it("classifies bleeds by where they start", () => {
    expect(bleedKind(cfg, "2026-11-22")).toBe("withdrawal"); // break
    expect(bleedKind(cfg, "2026-11-20")).toBe("withdrawal"); // pill 20
    expect(bleedKind(cfg, "2026-11-19")).toBe("withdrawal"); // pill 19
    expect(bleedKind(cfg, "2026-11-18")).toBe("breakthrough"); // pill 18
    expect(bleedKind(cfg, "2026-10-01")).toBe("unknown"); // before tracking
  });
});

describe("calibrateBleed", () => {
  it("keeps the defaults with fewer than 2 break bleeds", () => {
    const periods = [
      { start_date: "2026-11-23", end_date: "2026-11-26" },
      { start_date: "2026-11-10", end_date: null }, // breakthrough
      { start_date: "2026-10-01", end_date: null }, // before tracking
    ];
    expect(calibrateBleed(cfg, periods)).toBe(cfg);
  });

  it("learns start day (median) and length", () => {
    const out = calibrateBleed(cfg, [
      { start_date: "2026-11-23", end_date: "2026-11-27" }, // off 2, 5 days
      { start_date: "2026-12-21", end_date: "2026-12-25" }, // off 2, 5 days
      { start_date: "2027-01-20", end_date: "2027-01-22" }, // pill 21 → offset 0, 3 days
    ]);
    expect(out).toMatchObject({ bleedOffset: 1, bleedLength: 5 });
  });

  it("rounds an even median and clamps the length to 2–10", () => {
    const short = calibrateBleed(cfg, [
      { start_date: "2026-11-20", end_date: "2026-11-20" }, // offset 0, 1 day
      { start_date: "2026-12-21", end_date: "2026-12-21" }, // offset 1, 1 day
    ]);
    expect(short).toMatchObject({ bleedOffset: 1, bleedLength: 2 });
    const long = calibrateBleed(cfg, [
      { start_date: "2026-11-22", end_date: "2026-12-10" },
      { start_date: "2026-12-20", end_date: "2027-01-10" },
    ]);
    expect(long.bleedLength).toBe(10);
  });

  it("keeps the configured length when fewer than 2 bleeds have an end", () => {
    const out = calibrateBleed({ ...cfg, bleedLength: 3 }, [
      { start_date: "2026-11-23", end_date: null },
      { start_date: "2026-12-21", end_date: "2026-12-25" },
    ]);
    expect(out).toMatchObject({ bleedOffset: 1, bleedLength: 3 });
  });
});
