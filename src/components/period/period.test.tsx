import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { db, DEFAULT_TRACKING, type PeriodRow, type TrackingRow } from "../../data/db";
import { OWNER_ID, renderScreen } from "../../test/harness";
import NaturalToday from "./NaturalToday";
import PeriodCard from "./PeriodCard";
import PeriodEditor from "./PeriodEditor";

const P = (id: string, start_date: string, end_date: string | null = null): PeriodRow => ({
  id,
  owner_id: OWNER_ID,
  start_date,
  end_date,
  deleted: false,
  updated_at: "",
  dirty: 0,
});
const live = async () => (await db.periods.toArray()).filter((p) => !p.deleted);

describe("PeriodCard", () => {
  const show = (periods: PeriodRow[], today = "2026-11-10") =>
    renderScreen(<PeriodCard ownerId={OWNER_ID} periods={periods} today={today} />);

  it("starts a period today, with Undo", async () => {
    show([]);
    expect(screen.getByText("Not now")).toBeInTheDocument();
    fireEvent.click(screen.getByText("It started"));
    expect(await screen.findByText("Period started today · saved")).toBeInTheDocument();
    expect(await live()).toHaveLength(1);
    fireEvent.click(screen.getByText("Undo"));
    await waitFor(async () => expect(await live()).toHaveLength(0));
  });

  it("ends an ongoing period, with Undo", async () => {
    const p = P("a", "2026-11-08");
    await db.periods.put(p);
    show([p]);
    expect(screen.getByText("Day 3")).toBeInTheDocument();
    fireEvent.click(screen.getByText("It ended"));
    expect(await screen.findByText("Period ended today · saved")).toBeInTheDocument();
    expect((await db.periods.get("a"))!.end_date).toBe("2026-11-10");
    fireEvent.click(screen.getByText("Undo"));
    await waitFor(async () => expect((await db.periods.get("a"))!.end_date).toBeNull());
  });

  it("shows 'Ends today' when the end is already set to today", () => {
    show([P("a", "2026-11-08", "2026-11-10")]);
    expect(screen.getByText("Ends today ✓")).toBeInTheDocument();
  });

  it("opens the editor for another day or to change dates", () => {
    const { unmount } = show([]);
    fireEvent.click(screen.getByText("Another day"));
    expect(screen.getByRole("heading", { name: "Log a period" })).toBeInTheDocument();
    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.getByText("It started")).toBeInTheDocument();
    unmount();
    show([P("a", "2026-11-08")]);
    fireEvent.click(screen.getByText("Change dates"));
    expect(screen.getByRole("heading", { name: "Edit period" })).toBeInTheDocument();
  });

  it("flags an old period with no end", () => {
    show([P("old", "2026-10-01")]);
    expect(screen.getByText(/Your period from 1 Oct has no end date/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Set end"));
    expect(screen.getByRole("heading", { name: "Edit period" })).toBeInTheDocument();
  });
});

describe("PeriodEditor", () => {
  const show = (period: PeriodRow | null, all: PeriodRow[] = [], defaultStart?: string) => {
    const onDone = vi.fn();
    renderScreen(
      <PeriodEditor ownerId={OWNER_ID} period={period} all={all} today="2026-11-10" defaultStart={defaultStart} onDone={onDone} />,
    );
    return onDone;
  };
  const set = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

  it("logs a new past period", async () => {
    const onDone = show(null, [], "2026-11-01");
    expect(screen.getByLabelText("Still bleeding")).not.toBeChecked();
    set("Ended", "2026-11-04");
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(await live()).toMatchObject([{ start_date: "2026-11-01", end_date: "2026-11-04" }]);
    expect(screen.getByText("Period saved")).toBeInTheDocument();
  });

  it("defaults a new period to today, still bleeding", async () => {
    const onDone = show(null);
    expect(screen.getByLabelText("Still bleeding")).toBeChecked();
    expect(screen.getByLabelText("Ended")).toBeDisabled();
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(await live()).toMatchObject([{ start_date: "2026-11-10", end_date: null }]);
  });

  it("validates the dates", () => {
    show(null, [P("x", "2026-10-01", "2026-10-05")], "2026-11-01");
    set("Started", "");
    expect(screen.getByText("Pick a start date")).toBeInTheDocument();
    set("Started", "2026-11-12");
    expect(screen.getByText("Start can't be in the future")).toBeInTheDocument();
    set("Started", "2026-11-05");
    set("Ended", "2026-11-03");
    expect(screen.getByText("End must be on or after the start")).toBeInTheDocument();
    set("Ended", "2026-11-12");
    expect(screen.getByText(/End can't be in the future/)).toBeInTheDocument();
    set("Started", "2026-10-03");
    set("Ended", "2026-10-06");
    expect(screen.getByText("This overlaps another logged period")).toBeInTheDocument();
    expect(screen.getByText("Save")).toBeDisabled();
    fireEvent.click(screen.getByText("Save"));
  });

  it("edits a period and toggles 'Still bleeding'", async () => {
    const p = P("a", "2026-11-01");
    await db.periods.put(p);
    const onDone = show(p, [p]);
    fireEvent.click(screen.getByLabelText("Still bleeding"));
    set("Ended", "2026-11-05");
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect((await db.periods.get("a"))!.end_date).toBe("2026-11-05");
    expect(screen.getByText("Period updated · saved")).toBeInTheDocument();
  });

  it("deletes after confirming, with Undo", async () => {
    const p = P("a", "2026-11-01", "2026-11-04");
    await db.periods.put(p);
    const onDone = show(p, [p]);
    fireEvent.click(screen.getByText("Delete this period"));
    await act(async () => fireEvent.click(within(screen.getByRole("alertdialog")).getByText("Cancel")));
    expect(onDone).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Delete this period"));
    await act(async () => fireEvent.click(within(screen.getByRole("alertdialog")).getByText("Delete")));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(await live()).toHaveLength(0);
    fireEvent.click(screen.getByText("Undo"));
    await waitFor(async () => expect(await live()).toHaveLength(1));
  });
});

describe("NaturalToday", () => {
  const tracking = (natural_since: string | null = null): TrackingRow => ({
    ...DEFAULT_TRACKING,
    mode: "natural",
    owner_id: OWNER_ID,
    natural_since,
    updated_at: "",
    dirty: 0,
  });
  const show = (periods: PeriodRow[], today: string, since: string | null = null) =>
    renderScreen(
      <NaturalToday tracking={tracking(since)} periods={periods} today={today}>
        <p>tiles</p>
      </NaturalToday>,
    );

  it("asks for a first period, noting a recent switch off the pill", () => {
    show([], "2026-11-10", "2026-11-01");
    expect(screen.getByText("Log your period to begin")).toBeInTheDocument();
    expect(screen.getByText(/first cycles after stopping the pill/)).toBeInTheDocument();
    expect(screen.getByText("tiles")).toBeInTheDocument();
  });

  it("shows the period day while bleeding", () => {
    show([P("a", "2026-11-08")], "2026-11-10");
    expect(screen.getByText("On your period")).toBeInTheDocument();
    expect(screen.getByText("Day 3")).toBeInTheDocument();
    expect(screen.getByText("of ~28")).toBeInTheDocument();
    expect(screen.getByText("Learning your cycle")).toBeInTheDocument();
    expect(screen.getByText("Next period ~6 Dec · fertile 17 Nov–23 Nov")).toBeInTheDocument();
  });

  it("shows the fertile window", () => {
    show([P("a", "2026-11-01", "2026-11-05")], "2026-11-12", "2026-01-01");
    expect(screen.getByText("Fertile window")).toBeInTheDocument();
    expect(screen.getByText("Period in 17 days · ovulation ~15 Nov")).toBeInTheDocument();
    expect(screen.queryByText(/stopping the pill/)).toBeNull(); // switched long ago
  });

  it("counts down and shows confidence after ovulation", () => {
    show([P("a", "2026-11-01", "2026-11-05")], "2026-11-28");
    expect(screen.getByText("Natural cycle")).toBeInTheDocument();
    expect(screen.getByText("Period in 1 day · low confidence")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Cycle day 28 of about 28" })).toBeInTheDocument();
  });

  it("says when the period is due today or late", () => {
    const { unmount } = show([P("a", "2026-11-01", "2026-11-05")], "2026-11-29");
    expect(screen.getByText(/Period expected today/)).toBeInTheDocument();
    unmount();
    show([P("a", "2026-11-01", "2026-11-05")], "2026-11-30");
    expect(screen.getByText(/1 day later than predicted/)).toBeInTheDocument();
  });

  it("pluralises days late and caps the bars", () => {
    show([P("a", "2026-09-01", "2026-09-05")], "2026-11-10");
    expect(screen.getByText(/42 days later than predicted/)).toBeInTheDocument();
    expect(screen.getByRole("img").querySelectorAll(".pb")).toHaveLength(45);
  });

  it("names regular cycles", () => {
    show(
      [P("a", "2026-08-09", "2026-08-12"), P("b", "2026-09-06", "2026-09-09"), P("c", "2026-10-04", "2026-10-07"), P("d", "2026-11-01", "2026-11-04")],
      "2026-11-10",
    );
    expect(screen.getByText("Regular")).toBeInTheDocument();
  });
});
