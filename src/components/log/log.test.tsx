import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db, EMPTY_DAILY_LOG, type DailyLogRow } from "../../data/db";
import { OWNER_ID, renderScreen } from "../../test/harness";
import DailyLogSheet from "./DailyLogSheet";
import LogSummary from "./LogSummary";
import LogTodayCard from "./LogTodayCard";

const DATE = "2026-11-10";
const saved = () => db.dailyLogs.get([OWNER_ID, DATE]);
const put = (f: Partial<DailyLogRow>) =>
  db.dailyLogs.put({ ...EMPTY_DAILY_LOG, owner_id: OWNER_ID, date: DATE, deleted: false, updated_at: "", dirty: 0, ...f });
const chip = (name: string | RegExp) => screen.getByRole("button", { name });

afterEach(() => vi.useRealTimers());

describe("DailyLogSheet", () => {
  const open = async () => {
    const onClose = vi.fn();
    renderScreen(<DailyLogSheet ownerId={OWNER_ID} date={DATE} onClose={onClose} />);
    await screen.findByRole("dialog", { name: "Daily log" });
    return onClose;
  };
  const tap = async (name: string | RegExp) => {
    fireEvent.click(chip(name));
    await waitFor(() => expect(chip(name)).toHaveAttribute("aria-pressed", "true"));
  };

  it("saves each tap, and a second tap clears it", async () => {
    await open();
    expect(screen.getByRole("heading", { name: "Tuesday 10 November" })).toBeInTheDocument();
    await tap("Heavy");
    await tap("Cramps");
    await tap("Acne");
    await tap(/Calm/);
    await tap(/Good/);
    await tap("Protected");
    await tap("Creamy");
    expect(await saved()).toMatchObject({ flow: "heavy", symptoms: ["cramps", "acne"], mood: "calm", energy: 3, sex: "protected", discharge: "creamy" });

    fireEvent.click(chip("Heavy"));
    fireEvent.click(chip("Cramps"));
    await waitFor(async () => expect(await saved()).toMatchObject({ flow: null, symptoms: ["acne"] }));
  });

  it("handles exercise: a rest day has no workouts", async () => {
    await open();
    await tap("Yoga");
    await tap("Moderate");
    fireEvent.click(chip("Moderate")); // clear the level
    await waitFor(async () => expect((await saved())!.exercise).toBeNull());
    await tap("Rest day");
    expect(screen.queryByRole("button", { name: "Yoga" })).toBeNull();
    expect(await saved()).toMatchObject({ exercise: "rest", exercise_types: [] });
    fireEvent.click(chip("Rest day")); // tap again: not a rest day any more
    await waitFor(() => expect(chip("Yoga")).toBeInTheDocument());
    await tap("Walk");
    await tap("Yoga");
    fireEvent.click(chip("Walk"));
    await waitFor(async () => expect((await saved())!.exercise_types).toEqual(["yoga"]));
  });

  it("hides workout types on a saved rest day", async () => {
    await put({ exercise: "rest" });
    await open();
    expect(chip("Rest day")).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: "Walk" })).toBeNull();
  });

  it("saves typed weight and notes shortly after typing, and on close", async () => {
    await put({ notes: "old", weight_kg: 60 });
    const onClose = await open();
    const weight = await screen.findByPlaceholderText("e.g. 58.5");
    await waitFor(() => expect(weight).toHaveValue(60));
    expect(screen.getByPlaceholderText("Anything else about today")).toHaveValue("old");

    fireEvent.change(weight, { target: { value: "61.25" } });
    await waitFor(async () => expect((await saved())!.weight_kg).toBe(61.3), { timeout: 2000 });

    fireEvent.change(weight, { target: { value: "5" } });
    expect(screen.getByText(/Enter a weight between 20 and 300 kg/)).toBeInTheDocument();
    expect(weight).toHaveAttribute("aria-invalid", "true");
    fireEvent.change(weight, { target: { value: "" } });
    fireEvent.change(screen.getByPlaceholderText("Anything else about today"), { target: { value: "  " } });
    // Close straight away: pending changes are saved immediately.
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(onClose).toHaveBeenCalled();
    await waitFor(async () => expect(await saved()).toMatchObject({ weight_kg: null, notes: null }));
  });

  it("keeps a note with text, and Done goes back", async () => {
    const back = vi.spyOn(history, "back").mockImplementation(() => {});
    await open();
    fireEvent.change(screen.getByPlaceholderText("Anything else about today"), { target: { value: "tired" } });
    await waitFor(async () => expect((await saved())?.notes).toBe("tired"), { timeout: 2000 });
    fireEvent.click(screen.getByText("Done"));
    expect(back).toHaveBeenCalled();
  });

  it("doesn't save an impossible weight that was half typed", async () => {
    await open();
    const weight = screen.getByPlaceholderText("e.g. 58.5");
    fireEvent.change(weight, { target: { value: "70" } });
    fireEvent.change(weight, { target: { value: "700" } });
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(await saved()).toBeUndefined();
  });
});

describe("LogTodayCard", () => {
  const show = () => renderScreen(<LogTodayCard ownerId={OWNER_ID} today={DATE} />);

  it("invites a log, and opens the sheet", async () => {
    show();
    expect(screen.getByText("How are you?")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Log today"));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText("Another day")).toHaveAttribute("href", "/calendar");
  });

  it("summarises mood and symptoms", async () => {
    await put({ mood: "happy", symptoms: ["acne"] });
    show();
    expect(await screen.findByText("😊 Happy")).toBeInTheDocument();
    expect(screen.getByText("1 symptom")).toBeInTheDocument();
    expect(screen.getByText("Edit log")).toBeInTheDocument();
  });

  it("falls back to 'Logged ✓', symptom counts and flow", async () => {
    await put({ symptoms: ["acne", "cramps"] });
    const { unmount } = show();
    expect(await screen.findByText("Logged ✓")).toBeInTheDocument();
    expect(screen.getByText("2 symptoms")).toBeInTheDocument();
    unmount();
    await put({ flow: "light" });
    show();
    expect(await screen.findByText("Light flow")).toBeInTheDocument();
  });

  it("shows no note for other logs", async () => {
    await put({ energy: 2 });
    const { container } = show();
    await screen.findByText("Logged ✓");
    expect(container.querySelector(".tile-note")).toBeNull();
  });
});

describe("LogSummary", () => {
  it("lists everything logged", () => {
    render(
      <LogSummary
        log={{
          flow: "light",
          symptoms: ["cramps"],
          mood: "calm",
          energy: 4,
          exercise: "light",
          exercise_types: ["walk"],
          sex: "none",
          notes: " sore ",
          weight_kg: 60,
        }}
      />,
    );
    for (const t of ["Flow: Light", "😌 Calm", "Energy: High", "Exercise: Light · Walk", "Cramps", "Sex: No", "60 kg", "“sore”"])
      expect(screen.getByText(t)).toBeInTheDocument();
  });

  it("shows nothing for an empty shared log", () => {
    const { container } = render(
      <LogSummary log={{ flow: null, symptoms: null, mood: null, energy: null, sex: null, notes: null }} />,
    );
    expect(container.querySelector(".chips")).toBeNull();
    expect(container.querySelector(".note-text")).toBeNull();
  });
});
