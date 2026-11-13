import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PartnerDataProvider, usePartnerData } from "../../partner/PartnerData";
import { fake } from "../../test/fakeSupabase";
import { auth, OWNER_ID, renderScreen, signInAs } from "../../test/harness";
import { setNow } from "../../test/seed";
import PartnerCalendar from "./PartnerCalendar";
import PartnerHistory from "./PartnerHistory";
import PartnerHome from "./PartnerHome";

const PILL = { mode: "pill", pack_start_date: "2026-11-01", active_days: 21, break_days: 7, natural_since: null };
const NATURAL = { ...PILL, mode: "natural", pack_start_date: null };
const period = (id: string, start_date: string, end_date: string | null = null) => ({ id, start_date, end_date });
const log = (date: string, f: object = {}) => ({
  date,
  flow: null,
  symptoms: null,
  mood: null,
  energy: null,
  exercise: null,
  exercise_types: null,
  sex: null,
  notes: null,
  ...f,
});

function shareData(d: {
  periods?: boolean;
  pills?: boolean;
  tracking?: object | null;
  list?: object[];
  taken?: { date: string; taken_at: string | null }[];
  logs?: object[];
}) {
  fake.tables.sharing_settings = { share_periods: d.periods ?? true, share_pill_status: d.pills ?? false };
  fake.tables.tracking_settings = d.tracking === undefined ? PILL : d.tracking;
  fake.tables.periods = d.list ?? [];
  fake.tables.pill_logs = d.taken ?? [];
  fake.tables.shared_daily_logs = d.logs ?? [];
}

const show = (ui: React.ReactElement, route = "/partner") =>
  renderScreen(<PartnerDataProvider>{ui}</PartnerDataProvider>, route);

beforeEach(() => {
  signInAs("partner");
  setNow("2026-11-10T10:00:00");
});
afterEach(() => vi.useRealTimers());

describe("PartnerData", () => {
  function Probe() {
    const d = usePartnerData();
    return (
      <output>
        {d.loaded ? "loaded" : "cached"}|{d.ownerName}|{d.periods.length}|{d.takenDates.join(",")}|{Object.keys(d.logs).join(",")}|{d.takenAt["2026-11-10"]}
      </output>
    );
  }

  it("loads what she shares, caches it, and refreshes on her changes", async () => {
    shareData({ list: [period("a", "2026-11-01")], taken: [{ date: "2026-11-10", taken_at: "t" }], logs: [log("2026-11-09")] });
    const { unmount } = show(<Probe />);
    expect(await screen.findByText("loaded|Sonal|1|2026-11-10|2026-11-09|t")).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(`swarna.partner2.${OWNER_ID}`)!).loaded).toBe(true);

    // A burst of her changes → one refresh.
    fake.tables.periods = [period("a", "2026-11-01"), period("b", "2026-11-08")];
    const before = fake.calls.length;
    act(() => {
      fake.realtime[0]();
      fake.realtime[1]();
    });
    expect(await screen.findByText(/\|2\|/)).toBeInTheDocument();
    expect(fake.calls.length - before).toBe(5);

    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    await waitFor(() => expect(fake.calls.length - before).toBe(10));
    unmount();
    expect(fake.removedChannels).toBe(1);
  });

  it("opens from the cache, and keeps it when offline", async () => {
    localStorage.setItem(`swarna.partner2.${OWNER_ID}`, JSON.stringify({ periods: [period("a", "2026-11-01")], loaded: false }));
    fake.errors.periods = { message: "offline" };
    show(<Probe />);
    expect(screen.getByText("cached|Sonal|1|||")).toBeInTheDocument();
    await waitFor(() => expect(fake.calls.length).toBe(5));
    expect(screen.getByText("cached|Sonal|1|||")).toBeInTheDocument();
  });

  it("copes with a broken cache, blocked storage and missing data", async () => {
    localStorage.setItem(`swarna.partner2.${OWNER_ID}`, "{oops");
    vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("full");
    });
    auth.counterpart = { ...auth.counterpart!, display_name: "" };
    fake.tables = { sharing_settings: null, tracking_settings: null, periods: null, pill_logs: null, shared_daily_logs: null };
    show(<Probe />);
    expect(await screen.findByText("loaded|Your partner|0|||")).toBeInTheDocument();
  });

  it("must be used inside the provider", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow("usePartnerData must be used inside <PartnerDataProvider>");
  });
});

describe("PartnerHome", () => {
  const hero = () => screen.getByRole("region", { name: /^(Pill pack|Cycle) today$/ });
  const tile = (name: RegExp) => screen.getByRole("link", { name });

  it("shows Loading… until the first load", () => {
    fake.gate = new Promise(() => {});
    show(<PartnerHome />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Morning, Mayur" })).toBeInTheDocument();
  });

  it("shows her pill pack, phase, next bleed and pill status", async () => {
    shareData({ pills: true, taken: [{ date: "2026-11-10", taken_at: "2026-11-10T09:05:00" }], logs: [log("2026-11-10", { mood: "calm" })] });
    show(<PartnerHome />);
    expect(await within(await screen.findByRole("region", { name: "Pill pack today" })).findByText("Pill 10")).toBeInTheDocument();
    expect(within(hero()).getByText("of 21")).toBeInTheDocument();
    expect(within(hero()).getByText("Not bleeding")).toBeInTheDocument();
    expect(within(hero()).getByText("Active pills")).toBeInTheDocument();
    expect(within(hero()).getByRole("img", { name: "Pill 10 of 21" }).querySelectorAll(".pb")).toHaveLength(28);
    expect(tile(/^Next bleed: In 14 days, about 24 November to 27 November/)).toHaveAttribute("href", "/partner/calendar?date=2026-11-24");
    expect(tile(/^Pill today: taken at 09:05/)).toHaveTextContent("Taken ✓");
    expect(screen.getByRole("heading", { name: "Sonal today" })).toBeInTheDocument();
    expect(screen.getByText("😌 Calm")).toBeInTheDocument();
    expect(screen.getByText("Here's how Sonal is doing")).toBeInTheDocument();
  });

  it("says when the pill isn't taken yet, or was taken without a time", async () => {
    shareData({ pills: true });
    const { unmount } = show(<PartnerHome />);
    expect(await screen.findByRole("link", { name: /^Pill today: not taken yet/ })).toHaveTextContent("Not taken yet");
    unmount();
    shareData({ pills: true, taken: [{ date: "2026-11-10", taken_at: null }] });
    show(<PartnerHome />);
    expect(await screen.findByRole("link", { name: "Pill today: taken. Open in calendar" })).toBeInTheDocument();
  });

  it("shows bleeding now", async () => {
    shareData({ list: [period("a", "2026-11-08")] });
    show(<PartnerHome />);
    expect(await screen.findByText("Bleeding · day 3")).toBeInTheDocument();
    expect(screen.getByText("Bleeding")).toBeInTheDocument(); // phase
    expect(tile(/^Next bleed: Now · day 3\. Open/)).toBeInTheDocument();
  });

  it("covers the break week: today and tomorrow", async () => {
    shareData({ pills: true });
    setNow("2026-11-25T10:00:00");
    const { unmount } = show(<PartnerHome />);
    expect(await screen.findByText("Break 4")).toBeInTheDocument();
    expect(screen.getByText("of 7")).toBeInTheDocument();
    expect(tile(/^Next bleed: Today/)).toHaveClass("span-2"); // no pill tile in the break
    unmount();
    setNow("2026-11-23T10:00:00");
    show(<PartnerHome />);
    expect(await screen.findByRole("link", { name: /^Next bleed: Tomorrow/ })).toBeInTheDocument();
  });

  it("shows a pack that hasn't started", async () => {
    shareData({ tracking: { ...PILL, pack_start_date: "2026-11-15" } });
    show(<PartnerHome />);
    expect(await screen.findByText("New pack soon")).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("shows the natural cycle, and when she's late", async () => {
    shareData({ tracking: NATURAL, list: [period("a", "2026-11-01", "2026-11-05")] });
    const { unmount } = show(<PartnerHome />);
    expect(await screen.findByText("Day 10")).toBeInTheDocument();
    expect(screen.getByText("of ~28")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Cycle today" })).toBeInTheDocument();
    expect(screen.getByText("Around ovulation")).toBeInTheDocument();
    expect(tile(/^Next bleed: In 19 days/)).toBeInTheDocument();
    unmount();
    shareData({ tracking: NATURAL, list: [period("a", "2026-10-01", "2026-10-05")] });
    const r = show(<PartnerHome />);
    expect(await screen.findByRole("link", { name: /^Next bleed: 12 days late/ })).toBeInTheDocument();
    r.unmount();
    shareData({ tracking: NATURAL, list: [period("a", "2026-10-12", "2026-10-15")] });
    show(<PartnerHome />);
    expect(await screen.findByRole("link", { name: /^Next bleed: 1 day late/ })).toBeInTheDocument();
  });

  it("waits for her first period in natural mode", async () => {
    shareData({ tracking: NATURAL });
    show(<PartnerHome />);
    expect(await screen.findByText("Predictions appear once Sonal logs a period.")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "At a glance" })).toBeNull();
  });

  it("caps long natural cycles at 45 bars and shows the fertile window", async () => {
    shareData({ tracking: NATURAL, list: [period("a", "2026-09-01", "2026-09-05")] });
    show(<PartnerHome />);
    expect(await screen.findByText("Day 71")).toBeInTheDocument();
    expect(screen.getByRole("img").querySelectorAll(".pb")).toHaveLength(45);
  });

  it("says when nothing is shared, or tracking isn't set up", async () => {
    shareData({ periods: false, pills: false });
    const { unmount } = show(<PartnerHome />);
    expect(await screen.findByText("Sonal isn't sharing cycle or pill info with you right now.")).toBeInTheDocument();
    unmount();
    shareData({ tracking: null, list: [period("a", "2026-11-09")] });
    show(<PartnerHome />);
    expect(await screen.findByText("Sonal hasn't set up tracking yet.")).toBeInTheDocument();
  });

  it("shows only the pill tile when periods aren't shared", async () => {
    shareData({ periods: false, pills: true });
    show(<PartnerHome />);
    expect(await screen.findByRole("link", { name: /^Pill today/ })).toHaveClass("span-2");
    expect(screen.queryByRole("link", { name: /^Next bleed/ })).toBeNull();
  });

  it("shows her local time when she's in another timezone", async () => {
    auth.counterpart = { ...auth.counterpart!, timezone: "Asia/Kolkata" };
    auth.profile = { ...auth.profile!, display_name: "" };
    shareData({});
    show(<PartnerHome />);
    expect(await screen.findByText(/^Here's how Sonal is doing · Her time: Tue 15:30$/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Morning, there" })).toBeInTheDocument();
  });

  it("ignores an unknown timezone name", async () => {
    auth.counterpart = { ...auth.counterpart!, timezone: "Not/AZone" };
    shareData({});
    show(<PartnerHome />);
    expect(await screen.findByText("Here's how Sonal is doing")).toBeInTheDocument();
  });
});

describe("PartnerCalendar", () => {
  const panel = () => screen.getByRole("heading", { level: 2 }).closest<HTMLElement>("section")!;
  const pick = (label: RegExp) => fireEvent.click(screen.getByLabelText(label));

  it("says when nothing is shared", async () => {
    shareData({ periods: false, pills: false });
    show(<PartnerCalendar />, "/partner/calendar");
    expect(await screen.findByText("Sonal isn't sharing her calendar right now.")).toBeInTheDocument();
  });

  it("shows her days read-only", async () => {
    shareData({
      pills: true,
      list: [period("a", "2026-11-08", "2026-11-09")],
      taken: [{ date: "2026-11-02", taken_at: null }],
      logs: [log("2026-11-03", { mood: "happy" })],
    });
    show(<PartnerCalendar />, "/partner/calendar?date=2026-11-08");
    expect(await within(await screen.findByRole("region", { hidden: true }).catch(() => document.body)).findByText("Period day 1")).toBeInTheDocument();
    expect(within(panel()).getByText("Pill 8: not marked")).toBeInTheDocument();
    pick(/^Monday 2 November/);
    expect(within(panel()).getByText("Pill 2: taken ✓")).toBeInTheDocument();
    pick(/^Tuesday 3 November/);
    expect(within(panel()).getByText("😊 Happy")).toBeInTheDocument();
    pick(/^Tuesday 24 November/);
    expect(within(panel()).getByText("Bleed predicted (estimate)")).toBeInTheDocument();
    expect(within(panel()).getByText("Break day 3")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Next month"));
    fireEvent.click(screen.getByText("Today"));
    expect(screen.getByRole("heading", { name: "Tuesday 10 November" })).toBeInTheDocument();
  });

  it("shows natural-cycle estimates, and 'Nothing logged.'", async () => {
    shareData({ tracking: NATURAL, list: [period("a", "2026-11-01", "2026-11-05")] });
    show(<PartnerCalendar />, "/partner/calendar?date=2026-11-12");
    expect(await screen.findByText("Fertile window (estimate)")).toBeInTheDocument();
    pick(/^Sunday 15 November/);
    expect(within(panel()).getByText("Ovulation estimated")).toBeInTheDocument();
    pick(/^Saturday 7 November/);
    expect(within(panel()).getByText("Nothing logged.")).toBeInTheDocument();
  });

  it("works with only shared logs", async () => {
    shareData({ periods: false, pills: false, logs: [log("2026-11-10", { energy: 2 })] });
    show(<PartnerCalendar />, "/partner/calendar");
    expect(await screen.findByText("Energy: OK")).toBeInTheDocument();
  });
});

describe("PartnerHistory", () => {
  it("says when periods aren't shared", async () => {
    shareData({ periods: false });
    show(<PartnerHistory />, "/partner/periods");
    expect(await screen.findByText("Sonal isn't sharing her periods right now.")).toBeInTheDocument();
  });

  it("explains empty averages", async () => {
    shareData({ tracking: NATURAL });
    const { unmount } = show(<PartnerHistory />, "/partner/periods");
    expect(await screen.findByText("No bleeds logged yet.")).toBeInTheDocument();
    expect(screen.getByText("needs an ended period")).toBeInTheDocument();
    expect(screen.getByText("needs 2 periods")).toBeInTheDocument();
    unmount();
    shareData({});
    show(<PartnerHistory />, "/partner/periods");
    expect(await screen.findByText("needs 2 break-week bleeds")).toBeInTheDocument();
  });

  it("lists every bleed with cycles, averages, chart and patterns", async () => {
    shareData({
      tracking: { ...PILL, pack_start_date: "2026-08-02" },
      // Break bleeds 25 Aug, 22 Sep, 20 Oct; breakthrough 5 Oct; ongoing 8 Nov (breakthrough).
      list: [
        period("a", "2026-08-25", "2026-08-28"),
        period("b", "2026-09-22", "2026-09-25"),
        period("c", "2026-10-05", "2026-10-06"),
        period("d", "2026-10-20", "2026-10-23"),
        period("e", "2026-11-08"),
      ],
      logs: ["2026-08-25", "2026-09-22", "2026-10-20", "2026-09-23"].map((d) => log(d, { symptoms: ["cramps"] })).concat([log("2026-10-01")]),
    });
    show(<PartnerHistory />, "/partner/periods");
    const stats = await screen.findByRole("region", { name: "Averages" });
    expect(within(stats).getByText("5")).toBeInTheDocument();
    expect(within(stats).getByText("4")).toBeInTheDocument();
    expect(within(stats).getByText("28")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Cycle lengths for recent cycles" })).toBeInTheDocument();
    expect(screen.getByText("usually on day 1 of her cycle")).toBeInTheDocument();
    const rows = screen.getAllByRole("link");
    expect(rows[0]).toHaveAccessibleName("8 November 2026, ongoing. Open in calendar");
    expect(rows[0]).toHaveTextContent("ongoing · during active pills…");
    expect(rows[1]).toHaveTextContent("to 23 Oct · 28-day cycle4 d");
    expect(rows[2]).toHaveTextContent("to 6 Oct · during active pills2 d");
    expect(rows[4]).toHaveTextContent("to 28 Aug4 d");
    expect(rows[4]).toHaveAttribute("href", "/partner/calendar?date=2026-08-25");
  });

  it("shows a multi-day pattern", async () => {
    shareData({
      tracking: NATURAL,
      list: [period("a", "2026-09-01", "2026-09-04"), period("b", "2026-09-29", "2026-10-02")],
      logs: ["2026-09-01", "2026-09-02", "2026-09-29", "2026-09-30"].map((d) => log(d, { symptoms: ["cramps"] })),
    });
    show(<PartnerHistory />, "/partner/periods");
    expect(await screen.findByText("usually on days 1–2 of her cycle")).toBeInTheDocument();
  });
});
