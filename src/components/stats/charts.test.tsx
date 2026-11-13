import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import CycleChart from "./CycleChart";
import WeightChart from "./WeightChart";

const readout = () => document.querySelector(".chart-readout")!;

describe("CycleChart", () => {
  const cycles = [
    { start: "2026-08-10", length: 28, bleed: 5 },
    { start: "2026-09-07", length: 30, bleed: null },
    { start: "2026-10-07", length: 40, bleed: 50 }, // bleed capped at the cycle
  ];

  it("draws bars with the average and a readout of the newest cycle", () => {
    render(<CycleChart cycles={cycles} average={33} />);
    expect(screen.getByRole("img", { name: "Cycle lengths for recent cycles" })).toBeInTheDocument();
    expect(screen.getByText("avg 33")).toBeInTheDocument();
    expect(screen.getByText("average")).toBeInTheDocument();
    expect(readout()).toHaveTextContent("7 Oct 2026 · 40-day cycle · bled 50 days");
    expect(document.querySelectorAll(".fill-bleed")).toHaveLength(2);
  });

  it("shows another cycle on tap or hover", () => {
    render(<CycleChart cycles={cycles} average={null} />);
    expect(screen.queryByText("average")).toBeNull();
    const targets = document.querySelectorAll("rect[fill=transparent]");
    fireEvent.click(targets[1]);
    expect(readout()).toHaveTextContent("7 Sep 2026 · 30-day cycle");
    expect(readout()).not.toHaveTextContent("bled");
    fireEvent.pointerEnter(targets[0]);
    expect(readout()).toHaveTextContent("10 Aug 2026 · 28-day cycle · bled 5 days");
    expect(screen.getByText("10 Aug: 28-day cycle, 5 bleed days")).toBeInTheDocument();
  });

  it("labels only the first and last of many bars", () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ start: `2026-0${i + 1}-01`, length: 28, bleed: 28 }));
    render(<CycleChart cycles={many} average={28} />);
    expect(screen.getByText("1 Jan", { selector: "text" })).toBeInTheDocument();
    expect(screen.getByText("1 Aug", { selector: "text" })).toBeInTheDocument();
    expect(screen.queryByText("1 Mar", { selector: "text" })).toBeNull();
  });

  it("draws nothing without cycles", () => {
    const { container } = render(<CycleChart cycles={[]} average={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("WeightChart", () => {
  it("draws a line and shows the tapped point", () => {
    render(<WeightChart points={[{ date: "2026-10-01", kg: 60 }, { date: "2026-11-01", kg: 61.5 }]} />);
    expect(readout()).toHaveTextContent("1 Nov 2026 · 61.5 kg");
    const targets = document.querySelectorAll("circle[fill=transparent]");
    fireEvent.click(targets[0]);
    expect(readout()).toHaveTextContent("1 Oct 2026 · 60 kg");
    fireEvent.pointerEnter(targets[1]);
    expect(readout()).toHaveTextContent("61.5 kg");
    expect(screen.getByText("1 Oct", { selector: "text" })).toBeInTheDocument();
    expect(screen.getByText("1 Nov", { selector: "text" })).toBeInTheDocument();
  });

  it("centres a single point", () => {
    render(<WeightChart points={[{ date: "2026-10-01", kg: 60 }]} />);
    expect(screen.getByText("1 Oct", { selector: "text" })).toHaveAttribute("text-anchor", "middle");
  });

  it("draws nothing without points", () => {
    const { container } = render(<WeightChart points={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
