import { describe, expect, it, vi } from "vitest";
import { errorMessage } from "./supabase";

vi.unmock("./supabase"); // test the real module

describe("errorMessage", () => {
  it("turns errors into a sentence", () => {
    expect(errorMessage(null)).toBe("Something went wrong");
    expect(errorMessage("Nope")).toBe("Nope");
    expect(errorMessage({ message: "Invalid login" })).toBe("Invalid login");
    expect(errorMessage(new TypeError("Failed to fetch"))).toBe("Can't reach the server — check your connection.");
    expect(errorMessage({ message: 42 })).toBe("Something went wrong");
    expect(errorMessage(42)).toBe("Something went wrong");
  });
});

describe("supabaseConfigured", () => {
  it("is true only with a URL and key", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_SUPABASE_URL", undefined);
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", undefined);
    expect((await import("./supabase")).supabaseConfigured).toBe(false);
    vi.resetModules();
    vi.stubEnv("VITE_SUPABASE_URL", "https://x.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon");
    expect((await import("./supabase")).supabaseConfigured).toBe(true);
    vi.unstubAllEnvs();
  });
});
