import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { shareOrDownload } from "./shareFile";

const blob = new Blob(["a,b"], { type: "text/csv" });
const touch = (coarse: boolean) =>
  vi.spyOn(window, "matchMedia").mockReturnValue({ matches: coarse } as MediaQueryList);

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:x");
  URL.revokeObjectURL = vi.fn();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  delete (navigator as Partial<Navigator>).canShare;
  delete (navigator as Partial<Navigator>).share;
});

function stubShare(share: () => Promise<void>, canShare = true) {
  Object.assign(navigator, { canShare: vi.fn(() => canShare), share: vi.fn(share) });
}

describe("shareOrDownload", () => {
  it("opens the share sheet on a phone", async () => {
    touch(true);
    stubShare(() => Promise.resolve());
    expect(await shareOrDownload(blob, "log.csv")).toBe("shared");
  });

  it("reports a cancelled share", async () => {
    touch(true);
    stubShare(() => Promise.reject(Object.assign(new Error("no"), { name: "AbortError" })));
    expect(await shareOrDownload(blob, "log.csv")).toBe("cancelled");
  });

  it("downloads when sharing fails or isn't possible", async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    touch(true);
    stubShare(() => Promise.reject(new Error("boom")));
    expect(await shareOrDownload(blob, "log.csv")).toBe("downloaded");
    stubShare(() => Promise.resolve(), false);
    expect(await shareOrDownload(blob, "log.csv")).toBe("downloaded");
    touch(false);
    expect(await shareOrDownload(blob, "log.csv")).toBe("downloaded");
    expect(click).toHaveBeenCalledTimes(3);
    expect(document.querySelector("a[download]")).toBeNull();
    vi.advanceTimersByTime(10_000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:x");
  });
});
