import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import type { DailyLogRow, PeriodRow, TrackingRow } from "../data/db";
import { periodOn } from "./cycle";
import {
  DISCHARGE,
  energyLabel,
  exerciseLabel,
  flowLabel,
  MOODS,
  sexLabel,
  symptomLabel,
} from "./dailyLog";
import { packDay, toISODate, type PackConfig } from "./pill";
import { monthlyTrends, summarize, symptomPatterns } from "./stats";

// Builds the doctor export (CSV + PDF) entirely on the phone.

export interface ExportOptions {
  from: string; // yyyy-MM-dd inclusive
  to: string;
  includeSex: boolean;
  includeDischarge: boolean;
  includeNotes: boolean;
}

export interface ExportData {
  name: string;
  tracking: TrackingRow | null;
  periods: PeriodRow[];
  logs: DailyLogRow[];
  taken: Set<string>;
  today: string;
}

const moodText = (v: string | null) =>
  MOODS.find((m) => m.value === v)?.label ?? "";
const dischargeText = (v: string | null) =>
  DISCHARGE.find((d) => d.value === v)?.label ?? "";
const len = (a: string, b: string) =>
  differenceInCalendarDays(parseISO(b), parseISO(a)) + 1;

function packConfig(t: TrackingRow | null): PackConfig | null {
  return t?.mode === "pill" && t.pack_start_date
    ? {
        packStart: t.pack_start_date,
        activeDays: t.active_days,
        breakDays: t.break_days,
      }
    : null;
}

// ───────────── one row per day ─────────────

export interface DayRow {
  date: string;
  bleeding: string; // "Day 2" or ""
  flow: string;
  pill: string; // "Pill 14 taken" / "Pill 14 not marked" / "Break" / ""
  symptoms: string;
  mood: string;
  energy: string;
  exercise: string;
  discharge: string;
  sex: string;
  weight: string;
  notes: string;
}

export function dayRows(d: ExportData, o: ExportOptions): DayRow[] {
  const cfg = packConfig(d.tracking);
  const logs = new Map(d.logs.map((l) => [l.date, l]));
  const rows: DayRow[] = [];
  const last = o.to < d.today ? o.to : d.today;

  for (
    let day = parseISO(o.from);
    toISODate(day) <= last;
    day = addDays(day, 1)
  ) {
    const date = toISODate(day);
    const log = logs.get(date);
    const period = periodOn(d.periods, date, d.today);
    let pill = "";
    if (cfg) {
      const pd = packDay(cfg, day);
      if (pd.kind === "active")
        pill = `Pill ${pd.number} ${d.taken.has(date) ? "taken" : "not marked"}`;
      else if (pd.kind === "off") pill = `Break day ${pd.number}`;
    }
    const row: DayRow = {
      date,
      bleeding: period ? `Day ${len(period.start_date, date)}` : "",
      flow: flowLabel(log?.flow ?? null) ?? "",
      pill,
      symptoms: (log?.symptoms ?? []).map(symptomLabel).join("; "),
      mood: moodText(log?.mood ?? null),
      energy: energyLabel(log?.energy ?? null) ?? "",
      exercise:
        exerciseLabel(log?.exercise ?? null, log?.exercise_types ?? null) ?? "",
      discharge: o.includeDischarge
        ? dischargeText(log?.discharge ?? null)
        : "",
      sex: o.includeSex ? (sexLabel(log?.sex ?? null) ?? "") : "",
      weight: log?.weight_kg != null ? String(log.weight_kg) : "",
      notes: o.includeNotes ? (log?.notes ?? "").trim() : "",
    };
    // Skip days with nothing at all (in pill mode every pill day counts as data).
    const hasAnything = Object.entries(row).some(
      ([k, v]) => k !== "date" && v !== "",
    );
    if (hasAnything) rows.push(row);
  }
  return rows;
}

// ───────────── CSV ─────────────

function csvCell(v: string | number | null | undefined) {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(header: string[], rows: (string | number | null)[][]) {
  // Leading BOM so Excel opens UTF-8 (names, notes) correctly.
  return (
    "﻿" +
    [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") +
    "\r\n"
  );
}

export function dailyCsv(d: ExportData, o: ExportOptions): string {
  const cols: [keyof DayRow, string][] = [
    ["date", "Date"],
    ["bleeding", "Bleeding"],
    ["flow", "Flow"],
    ["pill", "Pill"],
    ["symptoms", "Symptoms"],
    ["mood", "Mood"],
    ["energy", "Energy"],
    ["exercise", "Exercise"],
    ...(o.includeDischarge
      ? ([["discharge", "Discharge"]] as [keyof DayRow, string][])
      : []),
    ...(o.includeSex ? ([["sex", "Sex"]] as [keyof DayRow, string][]) : []),
    ["weight", "Weight (kg)"],
    ...(o.includeNotes
      ? ([["notes", "Notes"]] as [keyof DayRow, string][])
      : []),
  ];
  return toCsv(
    cols.map(([, h]) => h),
    dayRows(d, o).map((r) => cols.map(([k]) => r[k])),
  );
}

export function periodsInRange(d: ExportData, o: ExportOptions) {
  const inRange = d.periods.filter(
    (p) => p.start_date >= o.from && p.start_date <= o.to,
  );
  return inRange.map((p) => {
    const next = d.periods.find((q) => q.start_date > p.start_date);
    return {
      start: p.start_date,
      end: p.end_date,
      length: p.end_date ? len(p.start_date, p.end_date) : null,
      cycle: next
        ? differenceInCalendarDays(
            parseISO(next.start_date),
            parseISO(p.start_date),
          )
        : null,
    };
  });
}

export function periodsCsv(d: ExportData, o: ExportOptions): string {
  return toCsv(
    ["Start", "End", "Bleed length (days)", "Cycle length (days)"],
    periodsInRange(d, o).map((p) => [
      p.start,
      p.end ?? "ongoing",
      p.length,
      p.cycle,
    ]),
  );
}

// ───────────── PDF ─────────────

// The built-in PDF font only covers Latin text; drop emoji and other symbols it can't draw.
const pdfText = (s: string) => s.replace(/[^ -ÿ–—‘’“”…\n]/g, "").trim();
const nice = (iso: string) => format(parseISO(iso), "d MMM yyyy");

export async function buildPdf(d: ExportData, o: ExportOptions): Promise<Blob> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const M = 40;
  const pageW = doc.internal.pageSize.getWidth();
  let y = M;

  const gold: [number, number, number] = [23, 18, 31]; // ink headers, like the app
  const lastY = () =>
    (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
      ?.finalY ?? y;
  const heading = (text: string) => {
    if (y > doc.internal.pageSize.getHeight() - 120) {
      doc.addPage();
      y = M;
    }
    doc.setFont("helvetica", "bold").setFontSize(13).setTextColor(40);
    doc.text(text, M, y);
    y += 8;
  };
  const table = (
    head: string[],
    body: (string | number)[][],
    opts: object = {},
  ) => {
    autoTable(doc, {
      startY: y,
      head: [head],
      body: body.map((r) => r.map((c) => pdfText(String(c)))),
      margin: { left: M, right: M },
      styles: { fontSize: 8.5, cellPadding: 4, overflow: "linebreak" },
      headStyles: { fillColor: gold, textColor: 255 },
      alternateRowStyles: { fillColor: [246, 243, 252] },
      ...opts,
    });
    y = lastY() + 22;
  };

  // Title
  doc.setFont("helvetica", "bold").setFontSize(18).setTextColor(30);
  doc.text(pdfText(`Cycle summary: ${d.name}`), M, y);
  y += 18;
  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(110);
  doc.text(
    `${nice(o.from)} – ${nice(o.to < d.today ? o.to : d.today)} · generated ${nice(d.today)} with Swarna`,
    M,
    y,
  );
  y += 26;

  // Overview
  const cfg = packConfig(d.tracking);
  const relevant = d.periods.filter((p) => p.start_date <= o.to);
  const s = summarize(relevant.filter((p) => p.start_date >= o.from));
  const overview: [string, string][] = [
    [
      "Tracking",
      cfg
        ? `Combined pill, ${cfg.activeDays} active / ${cfg.breakDays} break days (bleeds are withdrawal bleeds)`
        : "Natural cycle (no hormonal pill)",
    ],
    ["Periods logged in range", String(s.periodsLogged)],
    [
      "Average cycle length",
      s.avgCycle !== null
        ? `${s.avgCycle} days (shortest ${s.shortest}, longest ${s.longest})`
        : "–",
    ],
    ["Average bleed length", s.avgBleed !== null ? `${s.avgBleed} days` : "–"],
    [
      "Cycle regularity",
      s.variation !== null ? `±${s.variation} days (${s.regularity})` : "–",
    ],
  ];
  if (cfg) {
    const rows = dayRows(d, o).filter((r) => r.pill.startsWith("Pill"));
    const taken = rows.filter((r) => r.pill.endsWith("taken")).length;
    overview.push([
      "Pills marked taken",
      rows.length
        ? `${taken} of ${rows.length} (${Math.round((taken / rows.length) * 100)}%)`
        : "–",
    ]);
  }
  heading("Overview");
  table(["", ""], overview, {
    showHead: false,
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 170 } },
  });

  // Periods
  const periods = periodsInRange(d, o);
  heading("Periods");
  if (periods.length) {
    table(
      ["Started", "Ended", "Bleed length", "Cycle length"],
      periods.map((p) => [
        nice(p.start),
        p.end ? nice(p.end) : "ongoing",
        p.length ? `${p.length} d` : "–",
        p.cycle ? `${p.cycle} d` : "–",
      ]),
    );
  } else {
    doc
      .setFont("helvetica", "normal")
      .setFontSize(10)
      .setTextColor(110)
      .text("No periods logged in this range.", M, y + 6);
    y += 28;
  }

  // Symptoms
  const logsInRange = d.logs.filter((l) => l.date >= o.from && l.date <= o.to);
  const patterns = symptomPatterns(d.periods, logsInRange);
  if (patterns.length) {
    heading("Symptoms");
    table(
      [
        "Symptom",
        "Days logged",
        "Usual timing (cycle day 1 = first bleed day)",
      ],
      patterns.map((p) => [
        p.label,
        p.count,
        p.from === null
          ? p.count < 3
            ? "Not enough data yet"
            : "No clear pattern"
          : p.from === p.to
            ? `Day ${p.from}`
            : `Days ${p.from}–${p.to}`,
      ]),
    );
  }

  // PCOS-relevant monthly trends
  const months = monthlyTrends(
    logsInRange,
    o.to < d.today ? o.to : d.today,
    12,
  ).filter((m) => m.key >= o.from.slice(0, 7) && m.loggedDays > 0);
  if (months.length) {
    heading("Monthly trends (PCOS-relevant)");
    table(
      [
        "Month",
        "Days logged",
        "Acne days",
        "Hair-change days",
        "Low-mood days",
        "Avg weight (kg)",
      ],
      months.map((m) => [
        m.month,
        m.loggedDays,
        m.acneDays,
        m.hairDays,
        m.lowMoodDays,
        m.avgWeight ?? "–",
      ]),
    );
  }

  // Daily detail
  const rows = dayRows(d, o).filter(
    (r) =>
      r.bleeding ||
      r.flow ||
      r.symptoms ||
      r.mood ||
      r.energy ||
      r.exercise ||
      r.weight ||
      r.notes ||
      r.sex ||
      r.discharge ||
      r.pill.endsWith("not marked"),
  );
  if (rows.length) {
    heading("Daily log");
    const cols: [keyof DayRow, string][] = [
      ["date", "Date"],
      ["bleeding", "Bleeding"],
      ["flow", "Flow"],
      ...(cfg ? ([["pill", "Pill"]] as [keyof DayRow, string][]) : []),
      ["symptoms", "Symptoms"],
      ["mood", "Mood"],
      ["energy", "Energy"],
      ["exercise", "Exercise"],
      ...(o.includeDischarge
        ? ([["discharge", "Discharge"]] as [keyof DayRow, string][])
        : []),
      ...(o.includeSex ? ([["sex", "Sex"]] as [keyof DayRow, string][]) : []),
      ["weight", "kg"],
      ...(o.includeNotes
        ? ([["notes", "Notes"]] as [keyof DayRow, string][])
        : []),
    ];
    table(
      cols.map(([, h]) => h),
      rows.map((r) =>
        cols.map(([k]) =>
          k === "date" ? format(parseISO(r.date), "d MMM yy") : r[k],
        ),
      ),
      { styles: { fontSize: 7.5, cellPadding: 3, overflow: "linebreak" } },
    );
  }

  // Footer on every page
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(130);
    doc.text(
      "Self-reported data from the Swarna app. Predictions are estimates and not for contraception.",
      M,
      doc.internal.pageSize.getHeight() - 20,
    );
    doc.text(
      `${i} / ${pages}`,
      pageW - M,
      doc.internal.pageSize.getHeight() - 20,
      { align: "right" },
    );
  }

  return doc.output("blob");
}
