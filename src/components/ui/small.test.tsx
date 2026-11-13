import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import PackBars from "./PackBars";
import PageHeader from "./PageHeader";

const auth = vi.hoisted(() => ({ profile: null as null | { display_name: string } }));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => auth }));

describe("PackBars", () => {
  it("draws one bar per day", () => {
    render(<PackBars bars={["done", "now", "todo", "brk"]} label="Pill 2 of 21" />);
    const img = screen.getByRole("img", { name: "Pill 2 of 21" });
    expect(img.querySelectorAll(".pb")).toHaveLength(4);
    expect(img.children[1]).toHaveClass("pb now");
  });
});

describe("PageHeader", () => {
  const show = (props: Parameters<typeof PageHeader>[0]) =>
    render(<MemoryRouter><PageHeader {...props} /></MemoryRouter>);

  it("shows title, eyebrow, subtitle and her initial", () => {
    auth.profile = { display_name: "  priya" };
    show({ eyebrow: "Tue 10 Nov", title: "Good morning", subtitle: "Pill 10 of 21" });
    expect(screen.getByRole("heading", { name: "Good morning" })).toBeInTheDocument();
    expect(screen.getByText("Tue 10 Nov")).toBeInTheDocument();
    expect(screen.getByText("Pill 10 of 21")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Settings" })).toHaveTextContent("P");
    expect(screen.getByRole("link")).toHaveAttribute("href", "/settings");
  });

  it("falls back to S without a name", () => {
    auth.profile = null;
    const { container } = show({ title: "Stats" });
    expect(container.querySelector(".eyebrow")).toBeNull();
    expect(container.querySelector(".page-sub")).toBeNull();
    expect(screen.getByRole("link")).toHaveTextContent("S");
  });
});
