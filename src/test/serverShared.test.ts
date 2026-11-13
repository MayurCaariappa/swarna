// The Edge Function's shared maths (supabase/functions/_shared), which must
// agree with the app's versions in src/lib.
import { parseISO } from "date-fns";
import { describe, expect, it } from "vitest";
import { predictNextStart } from "../../supabase/functions/_shared/cycle.ts";
import {
  addDays,
  bleedStartOffDay,
  calibratedBleedOffDay,
  daysBetween,
  localNow,
  packDay,
  toMinutes,
} from "../../supabase/functions/_shared/pack.ts";
import { predict } from "../lib/cycle";
import { calibrateBleed, packDay as appPackDay } from "../lib/pill";

describe("date helpers", () => {
  it("adds and counts days across month and DST changes", () => {
    expect(addDays("2026-10-24", 10)).toBe("2026-11-03");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
  });
  it("reads HH:MM", () => {
    expect(toMinutes("21:30")).toBe(1290);
    expect(toMinutes("07:05:00")).toBe(425);
  });
});

describe("packDay", () => {
  it("matches the app for every day of two packs", () => {
    const cfg = { packStart: "2026-11-01", activeDays: 21, breakDays: 7 };
    expect(packDay(cfg.packStart, 21, 7, "2026-10-31")).toEqual({ kind: "before", number: 0 });
    for (let i = 0; i < 56; i++) {
      const date = addDays("2026-11-01", i);
      const app = appPackDay(cfg, parseISO(date));
      expect(packDay(cfg.packStart, 21, 7, date)).toEqual({ kind: app.kind, number: app.number });
    }
  });
});

describe("bleed timing", () => {
  it("defaults to off day 3, clamped to the break", () => {
    expect(bleedStartOffDay(7)).toBe(3);
    expect(bleedStartOffDay(2)).toBe(2);
    expect(bleedStartOffDay(0)).toBeNull();
  });

  it("learns her usual start day like the app", () => {
    const cfg = { packStart: "2026-11-01", activeDays: 21, breakDays: 7 };
    const cases = [
      [],
      [{ start_date: "2026-11-23", end_date: null }],
      [
        { start_date: "2026-11-23", end_date: null }, // off 2
        { start_date: "2026-11-10", end_date: null }, // breakthrough: ignored
        { start_date: "2026-12-19", end_date: null }, // pill 21 → offset 0
      ],
      [
        { start_date: "2026-11-24", end_date: null },
        { start_date: "2026-12-22", end_date: null },
        { start_date: "2027-01-19", end_date: null },
      ],
    ];
    for (const periods of cases) {
      const app = calibrateBleed(cfg, periods);
      const expected = periods.length >= 2 ? (app.bleedOffset ?? 2) + 1 : 3;
      expect(calibratedBleedOffDay(cfg.packStart, 21, 7, periods)).toBe(expected);
    }
    expect(calibratedBleedOffDay("2026-11-01", 28, 0, [])).toBeNull();
  });
});

describe("localNow", () => {
  const at = new Date("2026-11-10T20:30:00Z");
  it("gives her local date and minutes", () => {
    expect(localNow("Asia/Kolkata", at)).toEqual({ date: "2026-11-11", minutes: 120 });
    expect(localNow("Europe/London", at)).toEqual({ date: "2026-11-10", minutes: 1230 });
  });
  it("falls back to UTC for an unknown zone", () => {
    expect(localNow("Mars/Base", at)).toEqual({ date: "2026-11-10", minutes: 1230 });
    expect(localNow("UTC").date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("predictNextStart", () => {
  it("matches the app's prediction", () => {
    expect(predictNextStart([])).toBeNull();
    const sets = [
      [{ start_date: "2026-10-01", end_date: null }],
      [
        { start_date: "2026-08-01", end_date: null },
        { start_date: "2026-08-27", end_date: null },
        { start_date: "2026-09-02", end_date: null }, // 6-day gap: ignored
        { start_date: "2026-10-02", end_date: null },
      ],
    ];
    for (const ps of sets) expect(predictNextStart(ps)).toBe(predict(ps, "2026-11-01")!.nextStart);
  });
});
