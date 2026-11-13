import { act, renderHook } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { useOnline } from "./useOnline";

describe("useOnline", () => {
  it("follows the network", () => {
    const onLine = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    const { result, unmount } = renderHook(() => useOnline());
    expect(result.current).toBe(true);
    onLine.mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(result.current).toBe(false);
    unmount();
  });

  it("assumes online when rendered on a server", () => {
    function Probe() {
      return createElement("i", null, String(useOnline()));
    }
    expect(renderToString(createElement(Probe))).toContain("true");
  });
});
