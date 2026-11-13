import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import Layout from "./components/Layout";
import UpdateToast from "./components/UpdateToast";
import { fake } from "./test/fakeSupabase";
import { auth, renderScreen, signInAs } from "./test/harness";
import { pwa } from "./test/pwaRegister";
import { setNow } from "./test/seed";
import { Route, Routes } from "react-router-dom";

const cfg = vi.hoisted(() => ({ configured: true }));
vi.mock("./lib/supabase", async () => {
  const { supabase } = await import("./test/fakeSupabase");
  return {
    supabase,
    get supabaseConfigured() {
      return cfg.configured;
    },
    errorMessage: (e: { message?: string }) => e?.message ?? "Something went wrong",
  };
});
const sync = vi.hoisted(() => ({ startSync: vi.fn(() => () => {}) }));
vi.mock("./data/sync", () => ({
  startSync: sync.startSync,
  requestSync: vi.fn(),
  useSyncStatus: () => ({ state: "idle", lastSyncedAt: null, pending: false }),
}));
const push = vi.hoisted(() => ({ refreshPushSubscription: vi.fn(async () => {}), getPushState: vi.fn(async () => "off") }));
vi.mock("./lib/push", () => push);

beforeEach(() => {
  cfg.configured = true;
  setNow("2026-11-10T10:00:00");
});
afterEach(() => vi.useRealTimers());

const where = () => screen.getByTestId("where").textContent;

describe("App routes", () => {
  it("explains a missing Supabase setup", () => {
    cfg.configured = false;
    renderScreen(<App />);
    expect(screen.getByText(/Supabase isn't connected yet/)).toBeInTheDocument();
  });

  it("shows the splash while loading", () => {
    auth.loading = true;
    const { container } = renderScreen(<App />);
    expect(container.querySelector(".splash-logo")).not.toBeNull();
  });

  it("shows sign-in when signed out, but the install guide is always reachable", () => {
    const { unmount } = renderScreen(<App />, "/today");
    expect(screen.getByText("Private. Calm. Just for the two of you.")).toBeInTheDocument();
    unmount();
    renderScreen(<App />, "/install");
    expect(screen.getByRole("heading", { name: "Install Swarna" })).toBeInTheDocument();
  });

  it("asks a new account who it's for", () => {
    signInAs("new");
    const { unmount } = renderScreen(<App />);
    expect(screen.getByText("Who's using this account?")).toBeInTheDocument();
    unmount();
    renderScreen(<App />, "/install");
    expect(screen.getByRole("heading", { name: "Install Swarna" })).toBeInTheDocument();
  });

  it("asks an unlinked partner for the code", () => {
    signInAs("partner", { linked: false });
    const { unmount } = renderScreen(<App />);
    expect(screen.getByLabelText("Invite code")).toBeInTheDocument();
    unmount();
    renderScreen(<App />, "/install");
    expect(screen.getByRole("heading", { name: "Install Swarna" })).toBeInTheDocument();
  });

  it("sends her to Today and opens her pages", async () => {
    signInAs("owner");
    renderScreen(<App />, "/");
    await waitFor(() => expect(where()).toBe("/today"));
    for (const path of ["/calendar", "/stats", "/settings", "/export", "/install"]) {
      const { unmount } = renderScreen(<App />, path);
      await waitFor(() => expect(screen.getAllByTestId("where").at(-1)!.textContent).toBe(path));
      unmount();
    }
  });

  it("sends the partner to Home and keeps them out of her pages", async () => {
    signInAs("partner");
    const { unmount } = renderScreen(<App />, "/export");
    await waitFor(() => expect(where()).toBe("/partner"));
    unmount();
    renderScreen(<App />, "/partner/periods");
    expect(await screen.findByRole("link", { name: "Periods", current: "page" })).toBeInTheDocument();
  });

  it("scrolls to the top on every page change", async () => {
    signInAs("owner");
    const scroll = vi.spyOn(window, "scrollTo");
    renderScreen(<App />, "/today");
    fireEvent.click(await screen.findByRole("link", { name: "Calendar" }));
    await waitFor(() => expect(scroll).toHaveBeenCalledTimes(2));
  });
});

describe("Layout", () => {
  const show = (path: string) =>
    renderScreen(
      <Routes>
        <Route element={<Layout />}>
          <Route path="*" element={<p>page</p>} />
        </Route>
      </Routes>,
      path,
    );

  it("highlights the current tab, and keeps it on Settings", () => {
    signInAs("owner");
    show("/calendar");
    expect(screen.getByRole("link", { name: "Calendar" })).toHaveAttribute("aria-current", "page");
    fireEvent.click(screen.getByRole("link", { name: "Calendar" }));
    expect(sync.startSync).toHaveBeenCalledWith("owner-1");
    expect(push.refreshPushSubscription).toHaveBeenCalled();
  });

  it("keeps the last tab highlighted on Settings", async () => {
    signInAs("owner");
    renderScreen(
      <Routes>
        <Route element={<Layout />}>
          <Route path="/settings" element={<p>settings</p>} />
          <Route path="*" element={<a href="#x" onClick={(e) => e.preventDefault()}>x</a>} />
        </Route>
      </Routes>,
      "/stats",
    );
    expect(screen.getByRole("link", { name: "Stats" })).toHaveClass("active");
  });

  it("shows the first tab on Settings when opened directly", () => {
    signInAs("partner");
    show("/settings");
    expect(screen.getByRole("link", { name: "Home" })).toHaveClass("active");
    expect(screen.getByRole("link", { name: "Home" })).not.toHaveAttribute("aria-current");
  });

  it("shows an offline bar", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    signInAs("owner");
    const { unmount } = show("/today");
    expect(screen.getByText("Offline · your changes will sync later")).toBeInTheDocument();
    unmount();
    signInAs("partner");
    show("/partner");
    expect(screen.getByText("Offline · showing the last update")).toBeInTheDocument();
  });

  it("saves the phone's timezone when it changed", async () => {
    signInAs("owner");
    auth.profile = { ...auth.profile!, timezone: "Asia/Kolkata" };
    show("/today");
    await waitFor(() => expect(fake.writes("profiles", "update")).toHaveLength(1));
    expect(fake.writes("profiles", "update")[0].payload).toEqual({ timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
    await waitFor(() => expect(auth.refresh).toHaveBeenCalled());
  });

  it("doesn't refresh when saving the timezone fails, or when it matches", async () => {
    signInAs("partner");
    auth.profile = { ...auth.profile!, timezone: "Asia/Kolkata" };
    fake.errors.profiles = { message: "offline" };
    const { unmount } = show("/partner");
    await waitFor(() => expect(fake.writes("profiles")).toHaveLength(1));
    expect(auth.refresh).not.toHaveBeenCalled();
    unmount();
    auth.profile = { ...auth.profile!, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone };
    fake.calls = [];
    show("/partner");
    await new Promise((r) => setTimeout(r, 20));
    expect(fake.writes("profiles")).toHaveLength(0);
  });
});

describe("UpdateToast", () => {
  it("offers a refresh when a new version is ready", () => {
    pwa.needRefresh = true;
    renderScreen(<UpdateToast />);
    fireEvent.click(screen.getByText("New version available — tap to refresh"));
    expect(pwa.updateServiceWorker).toHaveBeenCalledWith(true);
    pwa.needRefresh = false;
  });

  it("checks for updates hourly and when reopened", () => {
    vi.useFakeTimers();
    const update = vi.fn();
    pwa.registration = { update };
    const { container } = renderScreen(<UpdateToast />);
    expect(container.querySelector(".toast")).toBeNull();
    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(update).toHaveBeenCalledTimes(1);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(update).toHaveBeenCalledTimes(1);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(update).toHaveBeenCalledTimes(2);
    pwa.registration = undefined;
  });
});
