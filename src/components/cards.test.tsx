import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { fake } from "../test/fakeSupabase";
import { auth, OWNER_ID, renderScreen, signInAs } from "../test/harness";
import Disclaimer from "./Disclaimer";
import InviteHint from "./InviteHint";
import WelcomeCard from "./WelcomeCard";

describe("WelcomeCard", () => {
  it("welcomes her once per phone", () => {
    signInAs("owner");
    const { unmount } = renderScreen(<WelcomeCard />);
    expect(screen.getByText("Taken ✓")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Got it"));
    expect(screen.queryByText("Welcome to Swarna 💜")).toBeNull();
    unmount();
    renderScreen(<WelcomeCard />);
    expect(screen.queryByText("Welcome to Swarna 💜")).toBeNull();
  });

  it("has a partner version", () => {
    signInAs("partner");
    renderScreen(<WelcomeCard />);
    expect(screen.getByText(/what Sonal chooses to share/)).toBeInTheDocument();
  });

  it("says 'she' when the partner isn't linked, and hides without a login", () => {
    signInAs("partner", { linked: false });
    const { unmount } = renderScreen(<WelcomeCard />);
    expect(screen.getByText(/what she chooses to share/)).toBeInTheDocument();
    unmount();
    signInAs("partner");
    auth.session = null;
    renderScreen(<WelcomeCard />);
    expect(screen.queryByText("Welcome to Swarna 💜")).toBeNull();
  });

  it("still works when storage is blocked", () => {
    signInAs("owner");
    vi.spyOn(localStorage, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    renderScreen(<WelcomeCard />);
    fireEvent.click(screen.getByText("Got it"));
    expect(screen.queryByText("Got it")).toBeNull();
  });
});

describe("InviteHint", () => {
  const future = "2099-01-02T00:00:00Z";

  it("invites her to link a partner", async () => {
    renderScreen(<InviteHint ownerId={OWNER_ID} />);
    expect(screen.getByText("Invite your partner")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/settings");
    await waitFor(() => expect(fake.calls.some((c) => c.table === "invite_codes")).toBe(true));
  });

  it("shows a pending code, and caches it", async () => {
    fake.tables.invite_codes = { code: "ABC123", expires_at: future };
    renderScreen(<InviteHint ownerId={OWNER_ID} />);
    expect(await screen.findByText("Invite code pending · ABC123")).toBeInTheDocument();
    expect(screen.getByText(/expires 2 Jan/)).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(`swarna.invite.${OWNER_ID}`)!)).toMatchObject({ code: "ABC123" });
  });

  it("uses the cached code offline, ignoring an expired one", async () => {
    localStorage.setItem(`swarna.invite.${OWNER_ID}`, JSON.stringify({ code: "OLD", expires_at: "2000-01-01T00:00:00Z" }));
    fake.errors.invite_codes = new Error("offline");
    renderScreen(<InviteHint ownerId={OWNER_ID} />);
    await waitFor(() => expect(fake.calls.length).toBe(1));
    expect(screen.getByText("Invite your partner")).toBeInTheDocument();
  });

  it("can be hidden for good", () => {
    const { unmount } = renderScreen(<InviteHint ownerId={OWNER_ID} />);
    fireEvent.click(screen.getByLabelText("Hide this card"));
    expect(screen.queryByText("Invite your partner")).toBeNull();
    unmount();
    renderScreen(<InviteHint ownerId={OWNER_ID} />);
    expect(screen.queryByText("Invite your partner")).toBeNull();
  });

  it("copes with blocked or broken storage", async () => {
    localStorage.setItem(`swarna.inviteHint.${OWNER_ID}`, "{not json");
    vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    fake.tables.invite_codes = { code: "ABC123", expires_at: future };
    renderScreen(<InviteHint ownerId={OWNER_ID} />);
    expect(await screen.findByText("Invite code pending · ABC123")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Hide this card"));
    expect(screen.queryByText(/Invite/)).toBeNull();
  });
});

describe("Disclaimer", () => {
  it("says predictions aren't contraception", () => {
    render(<Disclaimer />);
    expect(screen.getByText(/not for contraception/)).toBeInTheDocument();
  });
});
