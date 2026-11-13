import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConfirmProvider, useConfirm, type ConfirmOptions } from "./Confirm";

function Asker({ opts }: { opts: ConfirmOptions }) {
  const confirm = useConfirm();
  const [answer, setAnswer] = useState("none");
  return (
    <>
      <button onClick={async () => setAnswer(String(await confirm(opts)))}>Unlink</button>
      <p>answer: {answer}</p>
    </>
  );
}

function setup(opts: ConfirmOptions = { title: "Unlink partner?" }) {
  const root = document.createElement("div");
  root.id = "root";
  document.body.appendChild(root);
  const r = render(<ConfirmProvider><Asker opts={opts} /></ConfirmProvider>, { container: root });
  const opener = screen.getByText("Unlink");
  opener.focus();
  fireEvent.click(opener);
  return { ...r, root, opener };
}

beforeEach(() => {
  document.body.innerHTML = "";
  window.scrollTo = vi.fn();
});

describe("ConfirmSheet", () => {
  it("asks, locks the page, and resolves true on the action", async () => {
    const { root, opener } = setup({
      title: "Delete this period?",
      message: "This can't be undone.",
      action: "Delete",
      danger: true,
    });
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveAccessibleName("Delete this period?");
    expect(dialog).toHaveAccessibleDescription("This can't be undone.");
    expect(root).toHaveAttribute("inert");
    expect(document.body.style.position).toBe("fixed");
    expect(screen.getByText("Cancel")).toHaveFocus(); // safe default
    expect(screen.getByText("Delete")).toHaveClass("danger-solid");

    await act(async () => fireEvent.click(screen.getByText("Delete")));
    expect(screen.getByText("answer: true")).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(root).not.toHaveAttribute("inert");
    expect(document.body.style.position).toBe("");
    expect(opener).toHaveFocus(); // focus goes back
  });

  it("uses default labels and resolves false on Cancel, Escape or the backdrop", async () => {
    setup();
    expect(screen.getByRole("alertdialog")).not.toHaveAttribute("aria-describedby");
    expect(screen.getByText("OK")).toHaveClass("primary");
    await act(async () => fireEvent.click(screen.getByText("Cancel")));
    expect(screen.getByText("answer: false")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Unlink"));
    await act(async () => fireEvent.keyDown(document, { key: "Escape" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();

    fireEvent.click(screen.getByText("Unlink"));
    fireEvent.click(screen.getByRole("alertdialog")); // inside: stays open
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    await act(async () => fireEvent.click(document.querySelector(".confirm-backdrop")!));
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("keeps Tab inside the sheet", () => {
    setup({ title: "Sure?", action: "Yes", cancel: "No" });
    const yes = screen.getByText("Yes");
    const no = screen.getByText("No");
    fireEvent.keyDown(document, { key: "Tab" }); // from the last → first
    expect(yes).toHaveFocus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true }); // from the first → last
    expect(no).toHaveFocus();
    no.blur(); // focus outside the sheet
    fireEvent.keyDown(document, { key: "Tab" });
    expect(yes).toHaveFocus();
    yes.blur();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(no).toHaveFocus();
    yes.focus();
    fireEvent.keyDown(document, { key: "Tab" }); // middle of the cycle: browser handles it
    expect(yes).toHaveFocus();
    fireEvent.keyDown(document, { key: "a" }); // other keys ignored
  });

  it("must be used inside the provider", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Asker opts={{ title: "x" }} />)).toThrow("useConfirm must be used inside <ConfirmProvider>");
  });
});
