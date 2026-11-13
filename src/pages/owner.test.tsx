import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../data/db";
import { renderScreen, signInAs } from "../test/harness";
import { putLog, putPeriod, putTaken, putTracking, setNow } from "../test/seed";
import Calendar from "./Calendar";
import Stats from "./Stats";
import Today from "./Today";

beforeEach(() => {
  signInAs("owner");
  setNow("2026-11-10T10:00:00");
});
afterEach(() => vi.useRealTimers());

describe("Today", () => {
  it("asks her to set up a pack first", async () => {
    signInAs("owner", { linked: false });
    renderScreen(<Today />);
    expect(screen.getByRole("heading", { name: "Morning, Sonal" })).toBeInTheDocument();
    expect(screen.getByText("Tuesday 10 Nov")).toBeInTheDocument();
    expect(await screen.findByText("Set up your pill pack")).toBeInTheDocument();
    expect(screen.getByText("Invite your partner")).toBeInTheDocument();
    expect(screen.getByText(/not for contraception/)).toBeInTheDocument();
  });

  it("shows the pill pack with the Period and Today tiles", async () => {
    await putTracking({ pack_start_date: "2026-11-01" });
    renderScreen(<Today />);
    expect(await screen.findByText("Pill 10")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Period" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Today's log" })).toBeInTheDocument();
    expect(screen.queryByText("Invite your partner")).toBeNull(); // already linked
  });

  it("shows the natural cycle", async () => {
    await putTracking({ mode: "natural" });
    renderScreen(<Today />);
    expect(await screen.findByText("Log your period to begin")).toBeInTheDocument();
  });

  it("copes with a missing name", async () => {
    const { auth } = await import("../test/harness");
    auth.profile = null;
    renderScreen(<Today />);
    expect(screen.getByRole("heading", { name: "Morning," })).toBeInTheDocument();
  });
});

describe("Calendar", () => {
  const panel = () => screen.getByRole("heading", { level: 2 }).closest<HTMLElement>("section")!;

  it("shows today's pill and marks it, with Undo", async () => {
    await putTracking({ pack_start_date: "2026-11-01" });
    renderScreen(<Calendar />, "/calendar");
    expect(await screen.findByRole("heading", { name: "Tuesday 10 November" })).toBeInTheDocument();
    expect(within(panel()).getByText("Not taken yet")).toBeInTheDocument();
    fireEvent.click(within(panel()).getByText("Mark taken"));
    expect(await screen.findByText("Pill 10 marked taken")).toBeInTheDocument();
    expect(await within(panel()).findByText("Taken ✓")).toBeInTheDocument();
    fireEvent.click(within(panel()).getByText("Unmark"));
    expect(await screen.findByText("Pill 10 unmarked")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Undo"));
    expect(await within(panel()).findByText("Taken ✓")).toBeInTheDocument();
  });

  it("describes missed, upcoming, break and predicted days", async () => {
    await putTracking({ pack_start_date: "2026-11-01" });
    renderScreen(<Calendar />, "/calendar?date=2026-11-02");
    expect(await screen.findByText(/Not marked — check your leaflet/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/^Thursday 12 November/));
    expect(within(panel()).getByText("Upcoming")).toBeInTheDocument();
    expect(within(panel()).queryByText("Mark taken")).toBeNull();
    expect(within(panel()).queryByText("Add daily log")).toBeNull();
    fireEvent.click(screen.getByLabelText(/^Tuesday 24 November/));
    expect(within(panel()).getByText("Bleed predicted (estimate)")).toBeInTheDocument();
    expect(within(panel()).getByText("Break day 3")).toBeInTheDocument();
  });

  it("logs a period starting on a past day", async () => {
    await putTracking({ pack_start_date: "2026-11-01" });
    renderScreen(<Calendar />, "/calendar?date=2026-11-05");
    fireEvent.click(await screen.findByText("Log a period starting this day"));
    expect(screen.getByLabelText("Started")).toHaveValue("2026-11-05");
    fireEvent.click(screen.getByLabelText("Still bleeding")); // turn on → open
    fireEvent.click(screen.getByText("Save"));
    expect(await within(panel()).findByText("Period day 1")).toBeInTheDocument();
    expect(within(panel()).getByText("5 Nov – ongoing")).toBeInTheDocument();
  });

  it("ends an open period on a later day, with Undo", async () => {
    await putTracking({ mode: "natural" });
    await putPeriod("a", "2026-10-20", "2026-10-22");
    renderScreen(<Calendar />, "/calendar?date=2026-10-24");
    fireEvent.click(await screen.findByText("Period ended this day"));
    expect(await screen.findByText("Period ended 24 Oct · saved")).toBeInTheDocument();
    expect((await db.periods.get("a"))!.end_date).toBe("2026-10-24");
    fireEvent.click(screen.getByText("Undo"));
    await waitFor(async () => expect((await db.periods.get("a"))!.end_date).toBe("2026-10-22"));
  });

  it("edits a logged period and closes the editor on navigation", async () => {
    await putTracking({ mode: "natural" });
    await putPeriod("a", "2026-11-01", "2026-11-04");
    renderScreen(<Calendar />, "/calendar?date=2026-11-02");
    await screen.findByRole("heading", { name: "Monday 2 November" });
    expect(await within(panel()).findByText("Period day 2")).toBeInTheDocument();
    expect(within(panel()).getByText("1 Nov – 4 Nov")).toBeInTheDocument();
    const edit = () => {
      fireEvent.click(screen.getByLabelText(/^Monday 2 November/));
      fireEvent.click(within(panel()).getByText("Edit"));
      expect(screen.getByText("Delete this period")).toBeInTheDocument();
    };
    edit();
    fireEvent.click(screen.getByLabelText(/^Tuesday 3 November/));
    expect(screen.queryByText("Delete this period")).toBeNull();
    edit();
    fireEvent.click(screen.getByLabelText("Next month"));
    expect(screen.queryByText("Delete this period")).toBeNull();
    fireEvent.click(screen.getByLabelText("Previous month"));
    edit();
    fireEvent.click(screen.getByText("Today"));
    expect(screen.queryByText("Delete this period")).toBeNull();
    expect(screen.getByRole("heading", { name: "Tuesday 10 November" })).toBeInTheDocument();
  });

  it("shows fertile and ovulation estimates in natural mode", async () => {
    await putTracking({ mode: "natural" });
    await putPeriod("a", "2026-11-01", "2026-11-04");
    renderScreen(<Calendar />, "/calendar?date=2026-11-12");
    expect(await screen.findByText("Fertile window (estimate)")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/^Sunday 15 November/));
    expect(screen.getByText("Ovulation estimated (estimate)")).toBeInTheDocument();
  });

  it("opens the daily log and summarises it", async () => {
    await putTracking({ mode: "natural" });
    await putLog("2026-11-10", { mood: "calm" });
    renderScreen(<Calendar />, "/calendar");
    expect(await screen.findByText("😌 Calm")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Edit daily log"));
    expect(await screen.findByRole("dialog", { name: "Daily log" })).toBeInTheDocument();
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("offers to add a log on an empty past day", async () => {
    renderScreen(<Calendar />, "/calendar?date=2026-11-09");
    expect(await screen.findByText("Add daily log")).toBeInTheDocument();
  });

  it("shows nothing for a future day with no estimate, and nothing until data loads", async () => {
    await putTracking({ mode: "natural" });
    renderScreen(<Calendar />, "/calendar?date=2026-11-20");
    expect(await screen.findByRole("heading", { name: "Friday 20 November" })).toBeInTheDocument();
    expect(within(panel()).queryByRole("button")).toBeNull();
  });
});

describe("Stats", () => {
  const tile = (label: string) => screen.getByText(label).closest<HTMLElement>(".tile-stat")!;

  it("explains what's needed before there's data", async () => {
    await putTracking({ mode: "natural" });
    renderScreen(<Stats />);
    expect(await screen.findByText("Needs 2 periods")).toBeInTheDocument();
    expect(screen.getByText("Needs an ended period")).toBeInTheDocument();
    expect(screen.getByText("Needs 3 periods")).toBeInTheDocument();
    expect(within(tile("periods logged")).getByText("0")).toBeInTheDocument();
    expect(screen.getByText("Appears after two logged periods.")).toBeInTheDocument();
    expect(screen.getByText(/Log symptoms for a couple of cycles/)).toBeInTheDocument();
    expect(screen.getByText("Appears once you log a day.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Weight" })).toBeNull();
    expect(screen.getByText("Export for your doctor")).toHaveAttribute("href", "/export");
  });

  it("uses pill wording without data in pill mode", async () => {
    await putTracking({ pack_start_date: "2026-11-01" });
    renderScreen(<Stats />);
    expect(await screen.findByText("Needs 2 break-week bleeds")).toBeInTheDocument();
    expect(screen.getByText("Needs 3 break-week bleeds")).toBeInTheDocument();
    expect(screen.getByText(/Appears after two break-week bleeds/)).toBeInTheDocument();
    expect(screen.getByText("avg bleed-to-bleed")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Pills taken" })).toBeInTheDocument();
    expect(screen.getByText("0 of 10")).toBeInTheDocument();
  });

  it("summarises natural cycles, patterns, trends and weight", async () => {
    await putTracking({ mode: "natural", natural_since: "2026-01-01" });
    await putPeriod("old", "2025-12-01", "2025-12-05"); // before the switch: left out
    for (const [id, s, e] of [
      ["a", "2026-08-10", "2026-08-14"],
      ["b", "2026-09-07", "2026-09-11"],
      ["c", "2026-10-05", "2026-10-09"],
      ["d", "2026-11-02", null],
    ] as const)
      await putPeriod(id, s, e);
    for (const d of ["2026-08-10", "2026-09-07", "2026-10-05", "2026-11-02"])
      await putLog(d, { symptoms: ["cramps"], mood: "low", weight_kg: 60 });
    await putLog("2026-10-20", { symptoms: ["acne"], weight_kg: 61 });
    await putLog("2026-10-25", { symptoms: ["acne", "nausea"] });
    await putLog("2026-10-28", { symptoms: ["acne"] });
    renderScreen(<Stats />);
    expect(await screen.findByText("Regular")).toBeInTheDocument();
    expect(within(tile("avg cycle")).getByText("28")).toBeInTheDocument();
    expect(within(tile("avg bleed")).getByText("5")).toBeInTheDocument();
    expect(within(tile("regularity")).getByText("±0 d")).toBeInTheDocument();
    expect(screen.getByText("Shortest 28 days · longest 28 days")).toBeInTheDocument();
    expect(screen.getAllByText("28 d")).toHaveLength(3);
    expect(screen.getByText("Usually on day 1 of your cycle")).toBeInTheDocument();
    expect(screen.getByText("4 of 4")).toBeInTheDocument();
    expect(screen.getByText("No clear pattern yet")).toBeInTheDocument();
    expect(screen.getByText("3×")).toBeInTheDocument();
    expect(screen.getByText("Not enough data yet")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Weight" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Weight over time" })).toBeInTheDocument();
    const row = (m: string) => screen.getByText(m, { selector: "td" }).closest<HTMLElement>("tr")!;
    const cells = (m: string) => [...row(m).querySelectorAll("td")].map((td) => td.textContent);
    expect(cells("Oct 2026")).toEqual(["Oct 2026", "3", "0", "1", "60.5"]); // acne, hair, low mood, kg
    expect(cells("Sep 2026")).toEqual(["Sep 2026", "0", "0", "1", "60"]);
  });

  it("shows a pattern over several days, and bleeds without an end", async () => {
    await putTracking({ mode: "natural" });
    await putPeriod("a", "2026-09-07");
    await putPeriod("b", "2026-10-05");
    for (const d of ["2026-09-07", "2026-09-08", "2026-10-05", "2026-10-06"]) await putLog(d, { symptoms: ["cramps"] });
    renderScreen(<Stats />);
    expect(await screen.findByText("Usually on days 1–2 of your cycle")).toBeInTheDocument();
    expect(screen.getAllByText("–", { selector: "td" }).length).toBeGreaterThan(0);
  });

  it("counts breakthrough bleeds separately and shows pill adherence", async () => {
    await putTracking({ pack_start_date: "2026-09-06" });
    // Break bleeds 29 Sep, 27 Oct; breakthrough 13 Oct and 5 Nov.
    await putPeriod("a", "2026-09-29", "2026-10-02");
    await putPeriod("b", "2026-10-13", "2026-10-14");
    await putPeriod("c", "2026-10-27", "2026-10-30");
    await putTaken("2026-11-01", "2026-11-02");
    const { unmount } = renderScreen(<Stats />);
    expect(await screen.findByText(/1 bleed during your active pills .* isn't/)).toBeInTheDocument();
    expect(within(tile("periods logged")).getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Pack from 4 Oct")).toBeInTheDocument();
    expect(screen.getByText("2 of 10")).toBeInTheDocument();
    expect(screen.getByText("· 20%")).toBeInTheDocument();
    unmount();
    await putPeriod("d", "2026-11-05", "2026-11-06");
    renderScreen(<Stats />);
    expect(await screen.findByText(/2 bleeds during your active pills .* aren't/)).toBeInTheDocument();
  });

  it("shows '0 of 0' with no percentage on the first day of a pack", async () => {
    await putTracking({ pack_start_date: "2026-11-10" });
    renderScreen(<Stats />);
    expect(await screen.findByText("1 of 1".replace("1 of 1", "0 of 1"))).toBeInTheDocument();
  });
});
