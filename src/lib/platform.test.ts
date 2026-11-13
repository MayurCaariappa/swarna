import { afterEach, describe, expect, it, vi } from "vitest";

// platform.ts reads the user agent once on load, so each case loads a fresh copy.
async function load(ua: string, extra: Partial<Navigator> = {}) {
  vi.resetModules();
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(ua);
  vi.spyOn(navigator, "platform", "get").mockReturnValue(extra.platform ?? "");
  Object.defineProperty(navigator, "maxTouchPoints", { value: extra.maxTouchPoints ?? 0, configurable: true });
  return import("./platform");
}

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1";

afterEach(() => {
  delete (navigator as { standalone?: boolean }).standalone;
});

describe("platform detection", () => {
  it("detects iPhone Safari", async () => {
    const p = await load(IPHONE);
    expect(p).toMatchObject({ isIOS: true, isAndroid: false, isIOSNonSafari: false, platform: "ios" });
  });
  it("detects Chrome on iPhone", async () => {
    expect((await load(`${IPHONE} CriOS/120`)).isIOSNonSafari).toBe(true);
  });
  it("detects an iPad that says it's a Mac", async () => {
    expect((await load("Mozilla/5.0 (Macintosh)", { platform: "MacIntel", maxTouchPoints: 5 })).isIOS).toBe(true);
  });
  it("detects Android", async () => {
    expect((await load("Mozilla/5.0 (Linux; Android 15)")).platform).toBe("android");
  });
  it("calls anything else 'other'", async () => {
    expect((await load("Mozilla/5.0 (Macintosh)", { platform: "MacIntel" })).platform).toBe("other");
  });
});

describe("isStandalone", () => {
  it("is true from the Home Screen", async () => {
    const p = await load(IPHONE);
    expect(p.isStandalone()).toBe(false);
    (navigator as { standalone?: boolean }).standalone = true;
    expect(p.isStandalone()).toBe(true);
    delete (navigator as { standalone?: boolean }).standalone;
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList);
    expect(p.isStandalone()).toBe(true);
  });
});

describe("Android install prompt", () => {
  it("keeps the prompt for a later button tap", async () => {
    const p = await load("Android");
    expect(await p.promptInstall()).toBe(false);
    p.captureInstallPrompt();
    const changed = vi.fn();
    const stop = p.onInstallPromptChange(changed);

    const prompt = vi.fn().mockResolvedValue(undefined);
    const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
      prompt,
      userChoice: Promise.resolve({ outcome: "accepted" }),
    });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(p.canPromptInstall()).toBe(true);
    expect(changed).toHaveBeenCalledTimes(1);

    expect(await p.promptInstall()).toBe(true);
    expect(prompt).toHaveBeenCalled();
    expect(p.canPromptInstall()).toBe(false);

    window.dispatchEvent(
      Object.assign(new Event("beforeinstallprompt"), {
        prompt,
        userChoice: Promise.resolve({ outcome: "dismissed" }),
      }),
    );
    expect(await p.promptInstall()).toBe(false);

    window.dispatchEvent(new Event("beforeinstallprompt"));
    window.dispatchEvent(new Event("appinstalled"));
    expect(p.canPromptInstall()).toBe(false);
    stop();
    window.dispatchEvent(new Event("appinstalled"));
    expect(changed).toHaveBeenCalledTimes(6); // not called after stop()
  });
});
