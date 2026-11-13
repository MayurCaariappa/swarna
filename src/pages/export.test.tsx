import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { auth, renderScreen, signInAs } from "../test/harness";
import { putLog, putPeriod, putTaken, putTracking, setNow } from "../test/seed";
import Export from "./Export";

const share = vi.hoisted(() => ({ shareOrDownload: vi.fn() }));
vi.mock("../lib/shareFile", () => share);
const pdf = vi.hoisted(() => ({ buildPdf: vi.fn() }));
vi.mock("../lib/export", async (orig) => ({ ...(await orig<object>()), buildPdf: pdf.buildPdf }));

beforeEach(() => {
  signInAs("owner");
  setNow("2026-11-10T10:00:00");
  share.shareOrDownload.mockResolvedValue("downloaded");
  pdf.buildPdf.mockResolvedValue(new Blob(["%PDF"]));
});
afterEach(() => vi.useRealTimers());

const open = async () => {
  renderScreen(<Export />, "/export");
  await waitFor(() => expect(screen.getByText("PDF summary")).toBeEnabled());
};
const range = () => screen.getByText(/ – 10 Nov 2026/).textContent;

describe("Export", () => {
  it("picks a time range", async () => {
    await putTracking({ pack_start_date: "2026-03-01" });
    await putPeriod("a", "2026-04-02", "2026-04-05");
    await putLog("2026-02-20", { mood: "calm" });
    await putTaken("2026-03-01");
    await open();
    expect(range()).toBe("10 May 2026 – 10 Nov 2026");
    fireEvent.click(screen.getByText("3 months"));
    expect(range()).toBe("10 Aug 2026 – 10 Nov 2026");
    fireEvent.click(screen.getByText("12 months"));
    expect(range()).toBe("10 Nov 2025 – 10 Nov 2026");
    fireEvent.click(screen.getByText("Everything"));
    expect(range()).toBe("20 Feb 2026 – 10 Nov 2026"); // her earliest data
  });

  it("uses today for 'Everything' with no data", async () => {
    await open();
    fireEvent.click(screen.getByText("Everything"));
    expect(range()).toBe("10 Nov 2026 – 10 Nov 2026");
  });

  it("builds a PDF with the chosen options and names the file", async () => {
    await open();
    fireEvent.click(screen.getByLabelText("Notes"));
    fireEvent.click(screen.getByLabelText("Sex"));
    fireEvent.click(screen.getByLabelText("Discharge"));
    await act(async () => fireEvent.click(screen.getByText("PDF summary")));
    const [data, opts] = pdf.buildPdf.mock.calls[0];
    expect(data.name).toBe("Sonal");
    expect(opts).toEqual({ from: "2026-05-10", to: "2026-11-10", includeNotes: false, includeSex: true, includeDischarge: true });
    expect(share.shareOrDownload.mock.calls[0][1]).toBe("swarna-summary-2026-11-10.pdf");
    expect(screen.getByText("Saved swarna-summary-2026-11-10.pdf")).toBeInTheDocument();
  });

  it("builds both CSVs; a share sheet shows no message", async () => {
    auth.profile = null;
    share.shareOrDownload.mockResolvedValue("shared");
    await open();
    await act(async () => fireEvent.click(screen.getByText("Daily CSV")));
    await act(async () => fireEvent.click(screen.getByText("Periods CSV")));
    const [[daily, dailyName], [periods, periodsName]] = share.shareOrDownload.mock.calls;
    expect(dailyName).toBe("swarna-daily-2026-11-10.csv");
    expect(periodsName).toBe("swarna-periods-2026-11-10.csv");
    expect(await (daily as Blob).text()).toContain("Date,Bleeding");
    expect(await (periods as Blob).text()).toContain("Start,End");
    expect(screen.queryByText(/^Saved/)).toBeNull();
  });

  it("says when the file couldn't be made, and shows progress", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let fail!: (e: Error) => void;
    pdf.buildPdf.mockReturnValue(new Promise((_, r) => (fail = r)));
    await open();
    fireEvent.click(screen.getByText("PDF summary"));
    expect(screen.getByText("Creating PDF…")).toBeDisabled();
    await act(async () => fail(new Error("boom")));
    expect(screen.getByText("Couldn't create the file — please try again.")).toBeInTheDocument();

    let done!: (v: string) => void;
    share.shareOrDownload.mockReturnValue(new Promise((r) => (done = r)));
    fireEvent.click(screen.getByText("Daily CSV"));
    expect(screen.getAllByText("Creating…")[0]).toBeDisabled();
    await act(async () => done("cancelled"));
    fireEvent.click(screen.getByText("Periods CSV"));
    expect(screen.getAllByText("Creating…")).toHaveLength(1);
    await act(async () => done("cancelled"));
  });

  it("goes back, or to Settings when opened directly", async () => {
    await open();
    fireEvent.click(screen.getByText("‹ Back"));
    vi.spyOn(history, "length", "get").mockReturnValue(1);
    fireEvent.click(screen.getByText("‹ Back"));
    expect(screen.getByTestId("where")).toHaveTextContent("/settings");
  });
});
