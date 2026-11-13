import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { db, DEFAULT_TRACKING, type TrackingRow } from "../../data/db";
import { OWNER_ID, renderScreen } from "../../test/harness";
import PackSetup from "./PackSetup";
import PillToday from "./PillToday";

const tracking = (pack_start_date: string, patch: Partial<TrackingRow> = {}): TrackingRow => ({
  ...DEFAULT_TRACKING,
  owner_id: OWNER_ID,
  pack_start_date,
  updated_at: "",
  dirty: 0,
  ...patch,
});
const showPill = (start: string, today: string, patch: Partial<TrackingRow> = {}, route = "/today") =>
  renderScreen(<PillToday ownerId={OWNER_ID} tracking={tracking(start, patch)} today={today} />, route);
const hero = () => screen.getByRole("region", { name: "Pill pack today" });
const taken = (date: string) =>
  db.pillLogs.put({ owner_id: OWNER_ID, date, taken_at: `${date}T08:05:00`, deleted: false, updated_at: "", dirty: 0 });

describe("PillToday", () => {
  it("shows today's pill and lets her mark it taken, then undo", async () => {
    showPill("2026-11-01", "2026-11-10");
    expect(within(hero()).getByText("Pill 10")).toBeInTheDocument();
    expect(within(hero()).getByText("of 21")).toBeInTheDocument();
    expect(within(hero()).getByText("11 left · break Sun 22 Nov · bleed ~ 24–27 Nov")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Day 10 of a 28-day pack" })).toBeInTheDocument();
    expect(await screen.findByText(/9 pills aren't marked/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Mark taken/ }));
    expect(await within(hero()).findByText(/Taken at \d\d:\d\d/)).toBeInTheDocument();
    fireEvent.click(within(hero()).getByText("Undo"));
    expect(await screen.findByRole("button", { name: /Mark taken/ })).toBeInTheDocument();
  });

  it("marks a past pill from the strip, with Undo", async () => {
    await taken("2026-11-01");
    showPill("2026-11-01", "2026-11-03");
    const pill2 = await screen.findByRole("button", { name: "Pill 2, Mon 2 Nov, not marked" });
    expect(await screen.findByText(/1 pill isn't marked/)).toBeInTheDocument();
    fireEvent.click(pill2);
    expect(await screen.findByText("Pill 2 (2 Nov) marked taken")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Pill 2, Mon 2 Nov, taken" })).toHaveTextContent("✓");
    fireEvent.click(screen.getByRole("button", { name: "Pill 1, Sun 1 Nov, taken" }));
    expect(await screen.findByText("Pill 1 (1 Nov) unmarked")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Undo"));
    expect(await screen.findByRole("button", { name: "Pill 1, Sun 1 Nov, taken" })).toBeInTheDocument();
    // Future pills and break days can't be tapped.
    expect(screen.getByRole("button", { name: "Pill 4, Wed 4 Nov, upcoming" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Pill 3, Tue 3 Nov, not taken yet" })).toHaveClass("is-today");
    expect(screen.getByRole("button", { name: "Break day 3, Tue 24 Nov, bleed expected" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Break day 1, Sun 22 Nov, break" })).toBeDisabled();
  });

  it("shows 'Taken' when today's pill is already marked, with the pulse only from a reminder", async () => {
    await taken("2026-11-10");
    showPill("2026-11-01", "2026-11-10");
    expect(await within(hero()).findByText(/Taken at 08:05/)).toBeInTheDocument();
  });

  it("pulses the button when opened from a reminder", () => {
    showPill("2026-11-01", "2026-11-10", {}, "/today?take=1");
    expect(screen.getByRole("button", { name: /Mark taken/ })).toHaveClass("pulse");
  });

  it("pages between packs", async () => {
    showPill("2026-10-04", "2026-11-10");
    expect(screen.getByRole("heading", { name: "This pack" })).toBeInTheDocument();
    expect(screen.getByText(/started Sun 1 Nov/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next pack" }));
    expect(screen.getByRole("heading", { name: "Next pack" })).toBeInTheDocument();
    expect(screen.getByText("Starts Sun 29 Nov")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next pack" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Previous pack" }));
    fireEvent.click(screen.getByRole("button", { name: "Previous pack" }));
    expect(screen.getByRole("heading", { name: "Earlier pack" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous pack" })).toBeDisabled();
    expect(screen.queryByText(/aren't marked/)).toBeNull(); // only for this pack
  });

  it("shows the break week", () => {
    showPill("2026-11-01", "2026-11-24");
    expect(within(hero()).getByText("Break week")).toBeInTheDocument();
    expect(within(hero()).getByText("Break 3")).toBeInTheDocument();
    expect(within(hero()).getByText("of 7")).toBeInTheDocument();
    expect(within(hero()).getByText("new pack Sunday · bleed ~ 24–27 Nov")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Day 24 of a 28-day pack" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Mark taken/ })).toBeNull();
  });

  it("drops the bleed line once the expected bleed is over", () => {
    showPill("2026-11-01", "2026-11-28");
    expect(within(hero()).getByText("new pack tomorrow")).toBeInTheDocument();
  });

  it("counts down to a pack that hasn't started", () => {
    showPill("2026-11-11", "2026-11-10");
    expect(within(hero()).getByText("New pack soon")).toBeInTheDocument();
    expect(within(hero()).getByText("Tomorrow")).toBeInTheDocument();
    expect(screen.getByText("Starts Wed 11 Nov")).toBeInTheDocument();
  });

  it("says 'In N days' further ahead", () => {
    showPill("2026-11-15", "2026-11-10");
    expect(within(hero()).getByText("In 5 days")).toBeInTheDocument();
  });

  it("says 'Last pill' and shows a bleed across months", () => {
    showPill("2026-11-07", "2026-11-27");
    expect(within(hero()).getByText("Last pill · break tomorrow · bleed ~ 30 Nov–3 Dec")).toBeInTheDocument();
  });

  it("leaves out the break for continuous packs", () => {
    showPill("2026-11-01", "2026-11-10", { active_days: 28, break_days: 0 });
    expect(within(hero()).getByText("18 left")).toBeInTheDocument();
  });

  it("shows bleeding, with a note for breakthrough bleeding", async () => {
    await db.periods.put({ id: "p", owner_id: OWNER_ID, start_date: "2026-11-08", end_date: null, deleted: false, updated_at: "", dirty: 0 });
    showPill("2026-11-01", "2026-11-10");
    expect(await within(hero()).findByText("Bleeding · day 3")).toBeInTheDocument();
    expect(within(hero()).getByText(/Bleeding between breaks/)).toBeInTheDocument();
  });

  it("shows the pack legend", () => {
    showPill("2026-11-01", "2026-11-10");
    expect(screen.getByText("break · bleed expected")).toBeInTheDocument();
  });
});

describe("PackSetup", () => {
  const show = (today = "2026-11-10") => renderScreen(<PackSetup ownerId={OWNER_ID} today={today} />);
  const field = (name: RegExp | string) => screen.getByLabelText(name);
  const set = (name: RegExp | string, value: string) => fireEvent.change(field(name), { target: { value } });

  it("starts a pack today with the defaults", async () => {
    show();
    expect(screen.getByText("Today is pill 1 of 21")).toBeInTheDocument();
    set("Reminder time", "08:30");
    fireEvent.click(screen.getByText("Start tracking"));
    await waitFor(async () =>
      expect(await db.tracking.get(OWNER_ID)).toMatchObject({
        mode: "pill",
        pack_start_date: "2026-11-10",
        active_days: 21,
        break_days: 7,
        reminder_time: "08:30",
      }),
    );
    expect(await db.pillLogs.count()).toBe(0);
  });

  it("offers to mark earlier pills of the current pack", async () => {
    show();
    set(/current pack was taken on/, "2026-11-05");
    expect(screen.getByText("Today is pill 6 of 21")).toBeInTheDocument();
    expect(screen.getByText(/Marks 5 pills as taken, from 5 Nov 2026/)).toBeInTheDocument();
    expect(screen.getByRole("checkbox")).toBeChecked();
    fireEvent.click(screen.getByText("Start tracking"));
    await waitFor(async () => expect(await db.pillLogs.count()).toBe(5));
  });

  it("says '1 pill' for yesterday, and can skip marking", async () => {
    show();
    set(/current pack/, "2026-11-09");
    expect(screen.getByText(/Marks 1 pill as taken/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByText("Start tracking"));
    await waitFor(async () => expect(await db.tracking.get(OWNER_ID)).toBeDefined());
    expect(await db.pillLogs.count()).toBe(0);
  });

  it("leaves the switch off for older dates until she turns it on", async () => {
    show();
    set(/current pack/, "2026-10-01");
    expect(screen.getByText("Today is pill 13 of 21")).toBeInTheDocument();
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByText("Start tracking"));
    await waitFor(async () => expect(await db.pillLogs.count()).toBe(21 + 12));
  });

  it("previews break days and future packs", () => {
    show();
    set(/current pack/, "2026-10-17");
    expect(screen.getByText("Today is off day 4 of 7")).toBeInTheDocument();
    set(/current pack/, "2026-11-12");
    expect(screen.getByLabelText(/new pack will be taken on/)).toBeInTheDocument();
    expect(screen.getByText("Pack starts Thu 12 Nov")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("explains what's wrong and won't save", () => {
    show();
    set("Active pills", "0");
    expect(screen.getByText("Active pills must be a whole number from 1 to 365.")).toBeInTheDocument();
    expect(screen.getByText("Start tracking")).toBeDisabled();
    set("Active pills", "21");
    set("Break days", "61");
    expect(screen.getByText("Break days must be a whole number from 0 to 60.")).toBeInTheDocument();
    set("Break days", "7");
    set(/current pack/, "");
    expect(screen.getByText("Pick the date of the first pill.")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Start tracking"));
  });
});
