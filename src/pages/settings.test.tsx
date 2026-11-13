import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../data/db";
import type { SharingSettings } from "../lib/types";
import { fake } from "../test/fakeSupabase";
import { auth, OWNER_ID, renderScreen, signInAs } from "../test/harness";
import { putTracking } from "../test/seed";
import Settings from "./Settings";

const push = vi.hoisted(() => ({
  state: "off" as string,
  getPushState: vi.fn(),
  enablePush: vi.fn(),
  disablePush: vi.fn(),
  sendTestPush: vi.fn(),
}));
vi.mock("../lib/push", () => push);
const plat = vi.hoisted(() => ({ standalone: false }));
vi.mock("../lib/platform", () => ({ isStandalone: () => plat.standalone }));
const sync = vi.hoisted(() => ({ status: { state: "idle", lastSyncedAt: null as number | null, pending: false } }));
vi.mock("../data/sync", () => ({ useSyncStatus: () => sync.status, requestSync: vi.fn() }));

const sharing = (patch: Partial<SharingSettings> = {}): SharingSettings => ({
  owner_id: OWNER_ID,
  share_periods: true,
  share_pill_status: false,
  share_mood: false,
  share_energy: false,
  share_exercise: false,
  share_symptoms: false,
  share_sex: false,
  share_notes: false,
  partner_pill_alert: false,
  partner_pill_alert_time: null,
  updated_at: "",
  ...patch,
});

beforeEach(() => {
  push.getPushState.mockImplementation(async () => push.state);
  push.state = "off";
  plat.standalone = false;
  sync.status = { state: "idle", lastSyncedAt: null, pending: false };
});
afterEach(() => {
  delete (navigator as Partial<Navigator>).share;
  delete (navigator as { clipboard?: unknown }).clipboard;
});

const open = async () => {
  const r = renderScreen(<Settings />, "/settings");
  await screen.findByRole("heading", { name: "Reminders" });
  return r;
};
const section = (name: string) => screen.getByRole("heading", { name }).closest<HTMLElement>("section, form")!;
const toggle = (label: string) => screen.getByRole("checkbox", { name: new RegExp(`^${label}`) });

describe("Settings page", () => {
  it("shows her account, sections and version", async () => {
    signInAs("owner");
    await open();
    expect(screen.getByText("owner-1@example.com")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Tracking" })).toBeInTheDocument();
    expect(screen.getByText("Export for your doctor (PDF / CSV)")).toBeInTheDocument();
    expect(screen.getByText("Install on your Home Screen")).toBeInTheDocument();
    expect(screen.getByText("Saved on this phone")).toBeInTheDocument();
    expect(screen.getByText(/version test/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Sign out"));
    expect(auth.signOut).toHaveBeenCalled();
  });

  it("is shorter for the partner", async () => {
    signInAs("partner");
    plat.standalone = true;
    await open();
    expect(screen.queryByRole("heading", { name: "Tracking" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "What your partner can see" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Linked with" })).toBeInTheDocument();
    expect(screen.getByText("Installed ✓ — how to install on another phone")).toBeInTheDocument();
    expect(screen.queryByText(/Saved on this phone/)).toBeNull();
  });

  it("goes back, or home when opened directly", async () => {
    signInAs("partner");
    await open();
    fireEvent.click(screen.getByText("‹ Back"));
    vi.spyOn(history, "length", "get").mockReturnValue(1);
    fireEvent.click(screen.getByText("‹ Back"));
    expect(screen.getByTestId("where")).toHaveTextContent(/^\/$/);
  });

  it("describes the sync state", async () => {
    signInAs("owner");
    const states: [typeof sync.status, string | RegExp][] = [
      [{ state: "syncing", lastSyncedAt: null, pending: false }, "Syncing…"],
      [{ state: "error", lastSyncedAt: null, pending: true }, "Couldn't sync — will retry automatically"],
      [{ state: "idle", lastSyncedAt: null, pending: true }, "Waiting to sync"],
      [{ state: "idle", lastSyncedAt: Date.now(), pending: false }, /All changes synced · /],
    ];
    for (const [status, text] of states) {
      sync.status = status;
      const { unmount } = await open();
      expect(screen.getByText(text)).toBeInTheDocument();
      unmount();
    }
    sync.status = { state: "idle", lastSyncedAt: null, pending: true };
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    await open();
    expect(screen.getByText("Saved on this phone — will sync when online")).toBeInTheDocument();
  });
});

describe("Tracking section", () => {
  beforeEach(() => signInAs("owner"));

  it("edits the pack and reminder time", async () => {
    await putTracking({ pack_start_date: "2026-11-01", reminder_time: "21:00:00" });
    await open();
    const s = section("Tracking");
    fireEvent.change(within(s).getByLabelText(/First pill of a pack/), { target: { value: "2026-11-02" } });
    fireEvent.change(within(s).getByLabelText(/First pill of a pack/), { target: { value: "" } });
    fireEvent.change(within(s).getByLabelText("Reminder time"), { target: { value: "08:15" } });
    fireEvent.change(within(s).getByLabelText("Reminder time"), { target: { value: "" } });
    fireEvent.change(within(s).getByLabelText("Active pills"), { target: { value: "24" } });
    fireEvent.change(within(s).getByLabelText("Break days"), { target: { value: "4" } });
    await waitFor(async () =>
      expect(await db.tracking.get(OWNER_ID)).toMatchObject({
        pack_start_date: "2026-11-02",
        reminder_time: "08:15",
        active_days: 24,
        break_days: 4,
      }),
    );
  });

  it("explains invalid pack numbers without saving them", async () => {
    await putTracking({ pack_start_date: "2026-11-01" });
    await open();
    const active = screen.getByLabelText("Active pills");
    fireEvent.change(active, { target: { value: "0" } });
    expect(screen.getByRole("alert")).toHaveTextContent("Active pills must be a whole number from 1 to 365 — not saved (still 21).");
    expect(active).toHaveAttribute("aria-invalid", "true");
    fireEvent.blur(active); // stays shown while invalid
    expect(active).toHaveValue(0);
    fireEvent.change(active, { target: { value: "21" } });
    fireEvent.blur(active);
    const brk = screen.getByLabelText("Break days");
    fireEvent.change(brk, { target: { value: "" } });
    expect(screen.getByRole("alert")).toHaveTextContent("Break days must be a whole number from 0 to 60 — not saved (still 7).");
    fireEvent.blur(brk);
    fireEvent.change(brk, { target: { value: "7" } });
    fireEvent.blur(brk);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("switches to natural mode after confirming, and back", async () => {
    await putTracking({ pack_start_date: "2026-11-01" });
    await open();
    fireEvent.click(screen.getByText("On the pill")); // already on: nothing
    fireEvent.click(screen.getByText("Natural cycle"));
    await act(async () => fireEvent.click(within(screen.getByRole("alertdialog")).getByText("Cancel")));
    expect((await db.tracking.get(OWNER_ID))!.mode).toBe("pill");
    fireEvent.click(screen.getByText("Natural cycle"));
    await act(async () => fireEvent.click(within(screen.getByRole("alertdialog")).getByText("Switch")));
    await waitFor(async () => expect((await db.tracking.get(OWNER_ID))!.mode).toBe("natural"));
    expect((await db.tracking.get(OWNER_ID))!.natural_since).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await screen.findByText(/No pill reminders in natural cycle mode/);
    expect(screen.queryByLabelText("Active pills")).toBeNull();
    fireEvent.click(screen.getByText("On the pill"));
    await waitFor(async () => expect((await db.tracking.get(OWNER_ID))!.mode).toBe("pill"));
  });

  it("starts from the defaults when nothing is set up", async () => {
    await open();
    expect(screen.getByLabelText("Active pills")).toHaveValue(21);
    expect(screen.getByLabelText(/First pill of a pack/)).toHaveValue("");
  });
});

describe("Reminders section", () => {
  it("turns reminders on, sends a test and turns them off", async () => {
    signInAs("owner");
    await putTracking({ pack_start_date: "2026-11-01" });
    push.enablePush.mockResolvedValue("on");
    push.disablePush.mockResolvedValue("off");
    await open();
    const s = section("Reminders");
    expect(within(s).getByText(/Daily pill reminder at your chosen time/)).toBeInTheDocument();
    fireEvent.click(within(s).getByText("Turn on reminders"));
    expect(await within(s).findByText("Reminders are on for this phone ✓")).toBeInTheDocument();
    expect(within(s).getByText(/Keep your current alarm/)).toBeInTheDocument();

    push.sendTestPush.mockResolvedValueOnce(2).mockResolvedValueOnce(0).mockRejectedValueOnce(new Error("401"));
    fireEvent.click(within(s).getByText("Send test"));
    expect(await within(s).findByText("Test sent — it should arrive in a few seconds.")).toBeInTheDocument();
    fireEvent.click(within(s).getByText("Send test"));
    expect(await within(s).findByText(/No devices found/)).toBeInTheDocument();
    fireEvent.click(within(s).getByText("Send test"));
    expect(await within(s).findByText("401")).toBeInTheDocument();

    fireEvent.click(within(s).getByText("Turn off"));
    expect(await within(s).findByText("Turn on reminders")).toBeInTheDocument();
  });

  it("explains blocked, unsupported and not-installed states", async () => {
    signInAs("partner");
    for (const [state, text] of [
      ["denied", /Notifications are blocked/],
      ["unsupported", "This browser can't receive reminders."],
      ["needs-install", "Install Swarna first"],
    ] as const) {
      push.state = state;
      const { unmount } = await open();
      expect(screen.getByText(text)).toBeInTheDocument();
      expect(screen.getByText(/Alerts about her cycle/)).toBeInTheDocument();
      unmount();
    }
  });

  it("shows when permission is refused", async () => {
    signInAs("partner");
    push.enablePush.mockResolvedValue("denied");
    await open();
    fireEvent.click(screen.getByText("Turn on reminders"));
    expect(await screen.findByText(/Notifications are blocked/)).toBeInTheDocument();
  });
});

describe("Partner section", () => {
  it("creates and shares an invite code", async () => {
    signInAs("owner", { linked: false });
    fake.rpc.create_invite = () => ({ data: { code: "XYZ789", owner_id: OWNER_ID, expires_at: "2026-11-11T21:00:00", used_at: null }, error: null });
    const shareFn = vi.fn().mockRejectedValueOnce(new Error("cancel")).mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: shareFn, configurable: true });
    await open();
    const s = section("Partner");
    fireEvent.click(within(s).getByText("Invite partner"));
    expect(await within(s).findByText("XYZ789")).toBeInTheDocument();
    expect(within(s).getByText(/Expires 11 Nov, 21:00/)).toBeInTheDocument();
    fireEvent.click(within(s).getByText("Share"));
    fireEvent.click(within(s).getByText("Share"));
    await waitFor(() => expect(shareFn).toHaveBeenCalledTimes(2));
    expect(shareFn.mock.calls[0][0].text).toMatch(/my invite code is XYZ789/);
    fireEvent.click(within(s).getByText("New code"));
    await waitFor(() => expect(fake.calls.filter((c) => c.table === "rpc:create_invite")).toHaveLength(2));
  });

  it("copies the invite when sharing isn't available, and shows errors", async () => {
    signInAs("owner", { linked: false });
    fake.tables.invite_codes = { code: "OLD111", owner_id: OWNER_ID, expires_at: "2026-11-11T21:00:00", used_at: null };
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
    await open();
    const s = section("Partner");
    fireEvent.click(await within(s).findByText("Share"));
    await waitFor(() => expect(alert).toHaveBeenCalledWith("Copied to clipboard"));
    expect(writeText).toHaveBeenCalled();
    fake.rpc.create_invite = () => ({ data: null, error: { message: "Too many codes" } });
    fireEvent.click(within(s).getByText("New code"));
    expect(await within(s).findByText("Too many codes")).toBeInTheDocument();
  });

  it("shows the partner and unlinks after confirming", async () => {
    signInAs("owner");
    await open();
    const s = section("Partner");
    expect(s).toHaveTextContent("Sharing with Mayur · since 1 Nov 2026");
    fireEvent.click(within(s).getByText("Unlink"));
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent("Unlink from Mayur?");
    expect(dialog).toHaveTextContent("Mayur will immediately lose access");
    await act(async () => fireEvent.click(within(dialog).getByText("Cancel")));
    expect(fake.writes("partner_links")).toHaveLength(0);

    fake.errors.partner_links = { message: "offline" };
    fireEvent.click(within(s).getByText("Unlink"));
    await act(async () => fireEvent.click(within(screen.getByRole("alertdialog")).getByText("Unlink")));
    expect(fake.writes("partner_links", "delete")).toHaveLength(1);
    expect(await within(s).findByText("offline")).toBeInTheDocument();
    expect(auth.refresh).toHaveBeenCalled();
  });

  it("words unlinking for the partner, with a fallback name", async () => {
    signInAs("partner");
    auth.counterpart = null;
    await open();
    const s = section("Linked with");
    expect(s).toHaveTextContent("your partner · since 1 Nov 2026");
    fireEvent.click(within(s).getByText("Unlink"));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("You'll immediately lose access to what your partner shares.");
    await act(async () => fireEvent.click(within(screen.getByRole("alertdialog")).getByText("Unlink")));
    await waitFor(() => expect(auth.refresh).toHaveBeenCalled());
  });
});

describe("Sharing section", () => {
  beforeEach(() => signInAs("owner"));
  const openSharing = async (s: SharingSettings | null = sharing(), reminder = "21:00") => {
    await putTracking({ pack_start_date: "2026-11-01", reminder_time: reminder });
    fake.tables.sharing_settings = s;
    await open();
    if (s) await screen.findByRole("checkbox", { name: /^Periods & predictions/ });
  };

  it("toggles what the partner sees", async () => {
    await openSharing();
    expect(toggle("Periods & predictions")).toBeChecked();
    fireEvent.click(toggle("Mood"));
    expect(toggle("Mood")).toBeChecked();
    await waitFor(() => expect(fake.writes("sharing_settings", "update").at(-1)!.payload).toEqual({ share_mood: true }));
    expect(JSON.parse(localStorage.getItem(`swarna.sharing.${OWNER_ID}`)!).share_mood).toBe(true);
  });

  it("rolls back a change that couldn't be saved", async () => {
    await openSharing();
    fake.errors.sharing_settings = { message: "Can't reach the server" };
    fireEvent.click(toggle("Notes"));
    expect(await screen.findByText("Can't reach the server")).toBeInTheDocument();
    expect(toggle("Notes")).not.toBeChecked();
  });

  it("turns off the alert with pill status", async () => {
    await openSharing(sharing({ share_pill_status: true, partner_pill_alert: true, partner_pill_alert_time: "23:00:00" }));
    fireEvent.click(toggle("Pill status"));
    await waitFor(() =>
      expect(fake.writes("sharing_settings", "update").at(-1)!.payload).toEqual({ share_pill_status: false, partner_pill_alert: false }),
    );
    expect(toggle("Alert partner")).not.toBeChecked();
  });

  it("asks before the alert turns on pill sharing", async () => {
    await openSharing();
    fireEvent.click(toggle("Alert partner"));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Mayur will also see");
    await act(async () => fireEvent.click(within(screen.getByRole("alertdialog")).getByText("Cancel")));
    expect(toggle("Alert partner")).not.toBeChecked();
    fireEvent.click(toggle("Alert partner"));
    await act(async () => fireEvent.click(within(screen.getByRole("alertdialog")).getByText("Share and turn on")));
    expect(toggle("Alert partner")).toBeChecked();
    expect(toggle("Pill status")).toBeChecked();
    expect(screen.getByLabelText("Alert time")).toHaveValue("23:00");
    fireEvent.click(toggle("Alert partner"));
    expect(toggle("Alert partner")).not.toBeChecked();
  });

  it("turns the alert on straight away when pill status is shared", async () => {
    await openSharing(sharing({ share_pill_status: true, partner_pill_alert_time: "22:30" }));
    fireEvent.click(toggle("Alert partner"));
    await waitFor(() => expect(screen.getByLabelText("Alert time")).toHaveValue("22:30"));
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("won't save an alert time before her reminders finish", async () => {
    await openSharing(sharing({ share_pill_status: true, partner_pill_alert: true, partner_pill_alert_time: "23:00" }));
    const time = screen.getByLabelText("Alert time");
    fireEvent.change(time, { target: { value: "21:30" } });
    expect(screen.getByRole("alert")).toHaveTextContent("Not saved — 21:30 is before your reminders finish (21:00, then +30 and +60 min). Pick a time after 22:00. The alert stays at 23:00.");
    expect(time).toHaveAttribute("aria-invalid", "true");
    fireEvent.change(time, { target: { value: "" } }); // cleared box: ignored
    fireEvent.change(time, { target: { value: "22:15" } });
    expect(screen.queryByRole("alert")).toBeNull();
    await waitFor(() => expect(fake.writes("sharing_settings", "update").at(-1)!.payload).toEqual({ partner_pill_alert_time: "22:15" }));
  });

  it("warns when a saved alert is now too early, and handles late reminders", async () => {
    await openSharing(sharing({ share_pill_status: true, partner_pill_alert: true, partner_pill_alert_time: "21:30" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Your alert (21:30) is now before your reminders finish (21:00, then +30 and +60 min), so Mayur may be alerted before you've had a chance. Pick a time after 22:00.");
  });

  it("only flags times after a late-night reminder", async () => {
    await openSharing(sharing({ share_pill_status: true, partner_pill_alert: true, partner_pill_alert_time: "23:50" }), "23:30");
    expect(screen.getByRole("alert")).toHaveTextContent("Pick a time after 00:30");
    fireEvent.change(screen.getByLabelText("Alert time"), { target: { value: "06:00" } });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("uses the saved copy offline, or says it couldn't load", async () => {
    localStorage.setItem(`swarna.sharing.${OWNER_ID}`, JSON.stringify(sharing({ share_notes: true })));
    fake.errors.sharing_settings = { message: "offline" };
    await putTracking({ mode: "natural" });
    const { unmount } = await open();
    expect(await screen.findByRole("checkbox", { name: /^Notes/ })).toBeChecked();
    expect(screen.queryByText("offline")).toBeNull();
    unmount();
    localStorage.clear();
    await open();
    expect(await within(section("What your partner can see")).findByText("offline")).toBeInTheDocument();
  });

  it("shows Loading… first, and survives broken storage", async () => {
    localStorage.setItem(`swarna.sharing.${OWNER_ID}`, "{oops");
    let release!: () => void;
    fake.gate = new Promise((r) => (release = r));
    vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("full");
    });
    renderScreen(<Settings />, "/settings");
    expect(await screen.findByText("Loading…")).toBeInTheDocument();
    fake.tables.sharing_settings = sharing();
    release();
    expect(await screen.findByRole("checkbox", { name: /^Mood/ })).toBeInTheDocument();
  });

  it("ignores toggles before settings have loaded (no row yet)", async () => {
    await openSharing(null);
    expect(await within(section("What your partner can see")).findByText("Loading…")).toBeInTheDocument();
  });
});

describe("Feedback", () => {
  it("sends a suggestion, and reports failures", async () => {
    signInAs("partner");
    await open();
    const box = screen.getByPlaceholderText("What would make Swarna better?");
    const send = within(section("Suggest something")).getByText("Send");
    expect(send).toBeDisabled();
    fireEvent.change(box, { target: { value: " Dark mode toggle " } });
    fireEvent.click(send);
    expect(await screen.findByText("Thank you — saved.")).toBeInTheDocument();
    expect(fake.writes("feedback", "insert")[0].payload).toEqual({ message: "Dark mode toggle", app_version: "test" });
    expect(box).toHaveValue("");

    fake.errors.feedback = { message: "offline" };
    fireEvent.change(box, { target: { value: "x" } });
    fireEvent.click(within(section("Suggest something")).getByText("Send"));
    expect(await screen.findByText(/Couldn't send/)).toBeInTheDocument();
    fireEvent.change(box, { target: { value: "xy" } });
    expect(screen.queryByText(/Couldn't send/)).toBeNull();
  });
});
