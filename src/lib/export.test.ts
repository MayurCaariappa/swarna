import { addDays, format, parseISO } from "date-fns";
import { describe, expect, it } from "vitest";
import { EMPTY_DAILY_LOG, type DailyLogRow, type PeriodRow, type TrackingRow } from "../data/db";
import {
  buildPdf,
  dailyCsv,
  dayRows,
  periodsCsv,
  periodsInRange,
  type ExportData,
  type ExportOptions,
} from "./export";

const meta = { owner_id: "me", deleted: false, updated_at: "2026-11-01T00:00:00Z", dirty: 0 as const };
const period = (start_date: string, end_date: string | null = null): PeriodRow => ({
  id: start_date,
  start_date,
  end_date,
  ...meta,
});
const log = (date: string, f: Partial<DailyLogRow> = {}): DailyLogRow => ({
  ...EMPTY_DAILY_LOG,
  ...meta,
  date,
  ...f,
});
const pillTracking: TrackingRow = {
  ...meta,
  mode: "pill",
  pack_start_date: "2026-10-04",
  active_days: 21,
  break_days: 7,
  reminder_time: "21:00",
  natural_since: null,
};
const all: ExportOptions = {
  from: "2026-10-01",
  to: "2026-11-30",
  includeSex: true,
  includeDischarge: true,
  includeNotes: true,
};
const none: ExportOptions = { ...all, includeSex: false, includeDischarge: false, includeNotes: false };

const naturalData: ExportData = {
  name: "Sonu 💜",
  tracking: null,
  periods: [period("2026-10-03", "2026-10-06"), period("2026-10-31", "2026-11-03")],
  logs: [
    log("2026-10-04", {
      flow: "heavy",
      symptoms: ["cramps", "acne"],
      mood: "low",
      energy: 1,
      exercise: "light",
      exercise_types: ["walk"],
      discharge: "creamy",
      sex: "protected",
      weight_kg: 60.5,
      notes: '  said "ouch", twice\n',
    }),
    log("2026-10-20", { notes: "   " }),
  ],
  taken: new Set(),
  today: "2026-11-10",
};

describe("dayRows", () => {
  it("has one row per day with something on it, up to today", () => {
    const rows = dayRows(naturalData, all);
    expect(rows.map((r) => r.date)).toEqual([
      "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06",
      "2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03",
    ]);
    expect(rows[1]).toEqual({
      date: "2026-10-04",
      bleeding: "Day 2",
      flow: "Heavy",
      pill: "",
      symptoms: "Cramps; Acne",
      mood: "Low",
      energy: "Low",
      exercise: "Light · Walk",
      discharge: "Creamy",
      sex: "Protected",
      weight: "60.5",
      notes: 'said "ouch", twice',
    });
  });

  it("leaves out private fields unless asked", () => {
    const row = dayRows(naturalData, none)[1];
    expect(row).toMatchObject({ discharge: "", sex: "", notes: "" });
  });

  it("shows pills and break days in pill mode", () => {
    const d = { ...naturalData, tracking: pillTracking, taken: new Set(["2026-10-04"]) };
    const rows = dayRows(d, { ...all, from: "2026-10-04", to: "2026-10-31" });
    expect(rows[0].pill).toBe("Pill 1 taken");
    expect(rows[1].pill).toBe("Pill 2 not marked");
    expect(rows.find((r) => r.date === "2026-10-25")!.pill).toBe("Break day 1");
    // Before the first pack: no pill text.
    expect(dayRows(d, { ...all, from: "2026-10-01", to: "2026-10-02" })).toEqual([]);
  });
});

describe("CSV", () => {
  it("writes the daily CSV with escaping and a BOM", () => {
    const csv = dailyCsv(naturalData, all);
    expect(csv.startsWith("﻿Date,Bleeding,Flow,Pill,Symptoms,Mood,Energy,Exercise,Discharge,Sex,Weight (kg),Notes\r\n")).toBe(true);
    expect(csv).toContain('"said ""ouch"", twice"');
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("drops private columns", () => {
    const head = dailyCsv(naturalData, none).split("\r\n")[0];
    expect(head).toBe("﻿Date,Bleeding,Flow,Pill,Symptoms,Mood,Energy,Exercise,Weight (kg)");
  });

  it("writes the periods CSV", () => {
    const d = { ...naturalData, periods: [...naturalData.periods, period("2026-11-28")] };
    expect(periodsCsv(d, all).split("\r\n")).toEqual([
      "﻿Start,End,Bleed length (days),Cycle length (days),Type",
      "2026-10-03,2026-10-06,4,28,",
      "2026-10-31,2026-11-03,4,28,",
      "2026-11-28,ongoing,,,",
      "",
    ]);
  });
});

describe("periodsInRange", () => {
  it("labels withdrawal and breakthrough bleeds on the pill, skipping breakthrough for cycles", () => {
    const d: ExportData = {
      ...naturalData,
      tracking: pillTracking,
      periods: [period("2026-10-26", "2026-10-29"), period("2026-11-08", "2026-11-09"), period("2026-11-23")],
    };
    expect(periodsInRange(d, all)).toEqual([
      { start: "2026-10-26", end: "2026-10-29", length: 4, kind: "Withdrawal (break)", cycle: 28 },
      { start: "2026-11-08", end: "2026-11-09", length: 2, kind: "Breakthrough (active pills)", cycle: null },
      { start: "2026-11-23", end: null, length: null, kind: "Withdrawal (break)", cycle: null },
    ]);
  });

  it("keeps only periods starting in the range", () => {
    expect(periodsInRange(naturalData, { ...all, from: "2026-10-10" })).toHaveLength(1);
  });
});

describe("buildPdf", () => {
  const pdfText = async (blob: Blob) => {
    expect(blob.size).toBeGreaterThan(1000);
    return new TextDecoder("latin1").decode(await blob.arrayBuffer());
  };

  it("builds a natural-cycle PDF", async () => {
    const text = await pdfText(await buildPdf(naturalData, all));
    expect(text).toContain("Natural cycle");
    expect(text).toContain("Cycle summary: Sonu"); // emoji dropped
  });

  it("builds a pill PDF with breakthrough bleeds, symptoms, trends and page breaks", async () => {
    // Withdrawal bleeds every 28 days from 25 Oct 2025, plus one breakthrough bleed.
    const periods: PeriodRow[] = [];
    for (let k = 0; k < 14; k++) {
      const s = format(addDays(parseISO("2025-10-26"), k * 28), "yyyy-MM-dd");
      periods.push(period(s, format(addDays(parseISO(s), 3), "yyyy-MM-dd")));
    }
    periods.push(period("2026-11-08", "2026-11-09"));
    periods.sort((a, b) => a.start_date.localeCompare(b.start_date));
    const logs = periods.flatMap((p) => [
      log(p.start_date, { symptoms: ["cramps"], mood: "low", weight_kg: 60 }),
      log(format(addDays(parseISO(p.start_date), 1), "yyyy-MM-dd"), { symptoms: ["cramps", "acne"] }),
    ]);
    logs.push(log("2026-11-05", { symptoms: ["nausea"] }));
    const d: ExportData = {
      name: "Sonu",
      tracking: { ...pillTracking, pack_start_date: "2025-10-05" },
      periods,
      logs,
      taken: new Set(["2026-11-01", "2026-11-02"]),
      today: "2026-11-10",
    };
    const text = await pdfText(await buildPdf(d, { ...all, from: "2025-10-01" }));
    expect(text).toContain("Combined pill");
    expect(text).toContain("Breakthrough bleeds");
    expect(text).toContain("Monthly trends");
    expect(text).toMatch(/\/Count [2-9]/); // more than one page
  });

  it("says when there are no periods", async () => {
    const d: ExportData = { ...naturalData, tracking: pillTracking, periods: [], logs: [] };
    const text = await pdfText(await buildPdf(d, { ...none, from: "2026-09-01", to: "2026-09-30" }));
    expect(text).toContain("No periods logged in this range.");
  });
});
