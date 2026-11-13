import { AuthRetryableFetchError } from "@supabase/supabase-js";
import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../data/db";
import { fake, supabase } from "../test/fakeSupabase";

vi.unmock("./AuthProvider"); // test the real provider (Supabase stays fake)

const cfg = vi.hoisted(() => ({ configured: true }));
vi.mock("../lib/supabase", async () => {
  const { supabase } = await import("../test/fakeSupabase");
  return {
    supabase,
    get supabaseConfigured() {
      return cfg.configured;
    },
  };
});

const UID = "owner-1";
const session = { access_token: "a", refresh_token: "r", user: { id: UID, email: "s@example.com" } };
const profile = { id: UID, role: "owner", display_name: "Sonal", timezone: "Europe/London" };
const partner = { id: "p-1", role: "partner", display_name: "Mayur", timezone: "Asia/Kolkata" };
const link = { owner_id: UID, partner_id: "p-1", created_at: "2026-11-01" };
const account = { profile, link: null, counterpart: null };

/** Loads a fresh copy of the provider (it reads the saved login once, at startup). */
async function load() {
  vi.resetModules();
  return import("./AuthProvider");
}

async function show() {
  const { AuthProvider, useAuth } = await load();
  let api!: ReturnType<typeof useAuth>;
  function Probe() {
    api = useAuth();
    return (
      <output>
        {api.loading ? "loading" : "ready"}|{api.session?.user.id ?? "none"}|{api.profile?.display_name ?? "-"}|
        {api.counterpart?.display_name ?? "-"}
      </output>
    );
  }
  const r = render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  return { ...r, api: () => api };
}

let authEvents: ((event: string, s: unknown) => void) | null;
beforeEach(() => {
  cfg.configured = true;
  authEvents = null;
  supabase.auth.onAuthStateChange.mockImplementation((cb: typeof authEvents) => {
    authEvents = cb;
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  });
});

const signedIn = () => supabase.auth.getSession.mockResolvedValue({ data: { session }, error: null });

describe("AuthProvider", () => {
  it("is signed out with no saved login", async () => {
    await show();
    expect(await screen.findByText(/^ready\|none\|-\|/)).toBeInTheDocument();
  });

  it("loads the account after sign-in, with her partner", async () => {
    signedIn();
    fake.tables.profiles = [profile, partner];
    fake.tables.partner_links = link;
    await show();
    expect(screen.getByText(/^loading/)).toBeInTheDocument();
    expect(await screen.findByText(/^ready\|owner-1\|Sonal\|/)).toHaveTextContent("Sonal|Sonal"); // fake returns the first profile
    expect(JSON.parse(localStorage.getItem(`swarna.account.${UID}`)!).link).toEqual(link);
  });

  it("works for the partner side of a link", async () => {
    signedIn();
    fake.tables.profiles = [profile];
    fake.tables.partner_links = { ...link, owner_id: "x", partner_id: UID };
    await show();
    await screen.findByText(/^ready/);
    const lookups = fake.calls.filter((c) => c.table === "profiles");
    expect(lookups.at(-1)!.filters).toContainEqual(["eq", "id", "x"]);
  });

  it("opens instantly from the saved login and cached account", async () => {
    localStorage.setItem("swarna.auth", JSON.stringify(session));
    localStorage.setItem(`swarna.account.${UID}`, JSON.stringify(account));
    fake.gate = new Promise(() => {}); // the server never answers
    supabase.auth.getSession.mockReturnValue(new Promise(() => {}));
    await show();
    expect(screen.getByText(/^ready\|owner-1\|Sonal/)).toBeInTheDocument();
  });

  it("shows the cached account while refreshing it", async () => {
    localStorage.setItem(`swarna.account.${UID}`, JSON.stringify(account));
    signedIn();
    fake.errors.profiles = { message: "offline" }; // refresh fails: cache stays
    await show();
    expect(await screen.findByText(/^ready\|owner-1\|Sonal/)).toBeInTheDocument();
  });

  it("stays signed in offline when the token can't be renewed", async () => {
    localStorage.setItem("swarna.auth", JSON.stringify(session));
    supabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: new AuthRetryableFetchError("offline", 0) });
    await show();
    expect(await screen.findByText(/^ready\|owner-1\|-/)).toBeInTheDocument();
  });

  it("also restores the cached account offline", async () => {
    localStorage.setItem("swarna.auth", JSON.stringify(session));
    localStorage.setItem(`swarna.account.${UID}`, JSON.stringify(account));
    supabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: new AuthRetryableFetchError("offline", 0) });
    await show();
    await waitFor(() => expect(supabase.auth.getSession).toHaveBeenCalled());
    expect(await screen.findByText(/^ready\|owner-1\|Sonal/)).toBeInTheDocument();
  });

  it("signs out when the saved login is rejected", async () => {
    localStorage.setItem("swarna.auth", JSON.stringify(session));
    supabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: { message: "invalid" } });
    await show();
    expect(await screen.findByText(/^ready\|none/)).toBeInTheDocument();
  });

  it("ignores a broken or incomplete saved login and cache", async () => {
    localStorage.setItem("swarna.auth", "{oops");
    await show();
    expect(await screen.findByText(/^ready\|none/)).toBeInTheDocument();
    localStorage.setItem("swarna.auth", JSON.stringify({ access_token: "a" }));
    localStorage.setItem(`swarna.account.${UID}`, "{oops");
    signedIn();
    fake.errors.partner_links = { message: "x" };
    await show();
    expect(await screen.findAllByText(/^ready\|owner-1\|-/)).not.toHaveLength(0);
  });

  it("follows sign-in and sign-out events", async () => {
    fake.tables.profiles = [profile];
    await show();
    await screen.findByText(/^ready\|none/);
    await act(async () => authEvents!("SIGNED_IN", session));
    expect(await screen.findByText(/^ready\|owner-1\|Sonal/)).toBeInTheDocument();
    await act(async () => authEvents!("TOKEN_REFRESHED", null)); // a failed renewal doesn't sign out
    expect(screen.getByText(/^ready\|owner-1/)).toBeInTheDocument();
    await act(async () => authEvents!("SIGNED_OUT", null));
    expect(screen.getByText(/^ready\|none\|-/)).toBeInTheDocument();
  });

  it("refreshes on partner-link changes and when reopened", async () => {
    signedIn();
    fake.tables.profiles = [profile];
    const { unmount, api } = await show();
    await screen.findByText(/^ready\|owner-1/);
    const count = () => fake.calls.filter((c) => c.table === "partner_links").length;
    const before = count();
    await act(async () => fake.realtime[0]());
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await act(() => api().refresh());
    expect(count()).toBe(before + 3);
    unmount();
    expect(fake.removedChannels).toBe(1);
  });

  it("signs out: forgets the account and wipes the phone", async () => {
    signedIn();
    fake.tables.profiles = [profile];
    await db.meta.put({ key: "k", value: "v" });
    const { api } = await show();
    await screen.findByText(/^ready\|owner-1/);
    await act(() => api().signOut());
    expect(localStorage.getItem(`swarna.account.${UID}`)).toBeNull();
    expect(await db.meta.count()).toBe(0);
    expect(supabase.auth.signOut).toHaveBeenCalled();
  });

  it("does nothing on refresh / sign-out when signed out", async () => {
    const { api } = await show();
    await screen.findByText(/^ready\|none/);
    await act(() => api().refresh());
    await act(() => api().signOut());
    expect(fake.calls).toHaveLength(0);
  });

  it("survives storage that can't be written", async () => {
    signedIn();
    fake.tables.profiles = [profile];
    vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("full");
    });
    await show();
    expect(await screen.findByText(/^ready\|owner-1\|Sonal/)).toBeInTheDocument();
  });

  it("does nothing when Supabase isn't configured", async () => {
    cfg.configured = false;
    localStorage.setItem("swarna.auth", JSON.stringify(session));
    await show();
    expect(screen.getByText(/^ready\|none/)).toBeInTheDocument();
    expect(supabase.auth.getSession).not.toHaveBeenCalled();
  });

  it("must be used inside the provider", async () => {
    const { useAuth } = await load();
    vi.spyOn(console, "error").mockImplementation(() => {});
    function Bad() {
      useAuth();
      return null;
    }
    expect(() => render(<Bad />)).toThrow("useAuth must be used inside <AuthProvider>");
  });
});
