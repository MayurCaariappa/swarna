import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider, useToast } from "./Toast";

function Trigger({ undo }: { undo?: () => void }) {
  const toast = useToast();
  return (
    <>
      <button onClick={() => toast("Period started today", undo)}>go</button>
      <button onClick={() => toast("Saved")}>plain</button>
    </>
  );
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("Toast", () => {
  it("shows a message that hides after 5 seconds", () => {
    render(<ToastProvider><Trigger /></ToastProvider>);
    fireEvent.click(screen.getByText("plain"));
    expect(screen.getByRole("status")).toHaveTextContent("Saved");
    expect(screen.queryByText("Undo")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByText("Saved")).toBeNull();
  });

  it("replaces the previous message and offers Undo", async () => {
    const undo = vi.fn();
    const { unmount } = render(<ToastProvider><Trigger undo={undo} /></ToastProvider>);
    fireEvent.click(screen.getByText("plain"));
    fireEvent.click(screen.getByText("go"));
    expect(screen.queryByText("Saved")).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByText("Undo"));
    });
    expect(undo).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Period started today")).toBeNull();
    unmount();
  });

  it("must be used inside the provider", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Trigger />)).toThrow("useToast must be used inside <ToastProvider>");
  });
});
