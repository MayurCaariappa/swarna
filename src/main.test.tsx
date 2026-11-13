import { screen } from "@testing-library/react";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./App", () => ({ default: () => <p>app</p> }));
const plat = vi.hoisted(() => ({ captureInstallPrompt: vi.fn() }));
vi.mock("./lib/platform", () => plat);

describe("main", () => {
  it("starts the app in #root and listens for the install prompt", async () => {
    const root = document.createElement("div");
    root.id = "root";
    document.body.appendChild(root);
    await act(async () => {
      await import("./main");
    });
    expect(plat.captureInstallPrompt).toHaveBeenCalled();
    expect(screen.getByText("app")).toBeInTheDocument();
  });
});
