import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

// Node 25 has its own (file-backed, here unusable) localStorage that hides
// jsdom's, so give tests a plain in-memory one.
class MemoryStorage {
  private m = new Map<string, string>();
  get length() {
    return this.m.size;
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v));
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  clear() {
    this.m.clear();
  }
}
for (const name of ["localStorage", "sessionStorage"])
  Object.defineProperty(globalThis, name, { value: new MemoryStorage(), configurable: true, writable: true });

// Screens talk to a fake Supabase and a fake login (see fakeSupabase.ts and
// harness.tsx). Tests of the real modules opt out with vi.unmock / vi.mock.
vi.mock("../lib/supabase", async () => {
  const { supabase } = await import("./fakeSupabase");
  return {
    supabase,
    supabaseConfigured: true,
    errorMessage: (e: unknown) =>
      e && typeof e === "object" && "message" in e ? String(e.message) : String(e ?? "Something went wrong"),
  };
});
vi.mock("../auth/AuthProvider", async () => {
  const { auth } = await import("./harness");
  return { useAuth: () => auth, AuthProvider: ({ children }: { children: unknown }) => children };
});

beforeEach(async () => {
  const { fake } = await import("./fakeSupabase");
  const { signOutAll } = await import("./harness");
  fake.reset();
  signOutAll();
  localStorage.clear();
});

afterEach(async () => {
  cleanup();
  const { clearLocalData } = await import("../data/db");
  await clearLocalData();
});

// jsdom has no matchMedia / scrollTo.
if (!window.matchMedia)
  window.matchMedia = ((q: string) => ({
    matches: false,
    media: q,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
window.scrollTo = (() => {}) as typeof window.scrollTo;
