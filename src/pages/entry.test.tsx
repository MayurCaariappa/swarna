import { act, fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fake, supabase } from "../test/fakeSupabase";
import { auth, renderScreen, signInAs } from "../test/harness";
import InstallGuide from "./InstallGuide";
import Join from "./Join";
import Login from "./Login";
import Welcome from "./Welcome";

const plat = vi.hoisted(() => ({
  standalone: false,
  platform: "ios",
  nonSafari: false,
  canPrompt: false,
  listeners: new Set<() => void>(),
  promptInstall: vi.fn(),
}));
vi.mock("../lib/platform", () => ({
  isStandalone: () => plat.standalone,
  get platform() {
    return plat.platform;
  },
  get isIOSNonSafari() {
    return plat.nonSafari;
  },
  canPromptInstall: () => plat.canPrompt,
  onInstallPromptChange: (cb: () => void) => {
    plat.listeners.add(cb);
    return () => plat.listeners.delete(cb);
  },
  promptInstall: plat.promptInstall,
}));

beforeEach(() => {
  Object.assign(plat, { standalone: false, platform: "ios", nonSafari: false, canPrompt: false });
});

describe("Login", () => {
  const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
  const submit = () => fireEvent.submit(screen.getByLabelText("Email").closest("form")!);

  it("signs in, and checks the form first", async () => {
    renderScreen(<Login />);
    expect(screen.getByText("Install the app first")).toBeInTheDocument();
    submit();
    expect(screen.getByRole("alert")).toHaveTextContent("Enter your email address.");
    type("Email", " sonal@example.com ");
    submit();
    expect(screen.getByRole("alert")).toHaveTextContent("Enter your password.");
    type("Password", "abc"); // short passwords are fine for signing in
    await act(async () => submit());
    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({ email: "sonal@example.com", password: "abc" });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows a sign-in error", async () => {
    supabase.auth.signInWithPassword.mockResolvedValue({ data: {}, error: { message: "Invalid login credentials" } });
    plat.standalone = true;
    renderScreen(<Login />);
    expect(screen.queryByText("Install the app first")).toBeNull();
    type("Email", "a@b.co");
    type("Password", "x");
    await act(async () => submit());
    expect(screen.getByRole("alert")).toHaveTextContent("Invalid login credentials");
    expect(document.querySelector("button[type=submit]")).toBeEnabled();
  });

  it("creates an account and asks her to confirm the email", async () => {
    supabase.auth.signUp.mockResolvedValue({ data: { session: null }, error: null });
    renderScreen(<Login />);
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    type("Email", "a@b.co");
    type("Password", "short");
    submit();
    expect(screen.getByRole("alert")).toHaveTextContent("at least 8 characters");
    type("Password", "longenough");
    await act(async () => submit());
    expect(supabase.auth.signUp).toHaveBeenCalledWith({ email: "a@b.co", password: "longenough" });
    expect(screen.getByText(/Check your email and tap the confirmation link/)).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "current-password");
  });

  it("goes straight in when sign-up returns a session, and shows errors", async () => {
    supabase.auth.signUp.mockResolvedValueOnce({ data: { session: {} }, error: null });
    renderScreen(<Login />);
    fireEvent.click(screen.getAllByText("Create account")[0]);
    type("Email", "a@b.co");
    type("Password", "longenough");
    await act(async () => submit());
    expect(screen.queryByText(/Check your email/)).toBeNull();
    supabase.auth.signUp.mockResolvedValueOnce({ data: {}, error: { message: "User already registered" } });
    await act(async () => submit());
    expect(screen.getByRole("alert")).toHaveTextContent("User already registered");
  });

  it("sends a password reset link", async () => {
    renderScreen(<Login />);
    fireEvent.click(screen.getByText("Forgot password?"));
    expect(screen.queryByLabelText("Password")).toBeNull();
    fireEvent.click(screen.getByText("Back to sign in"));
    fireEvent.click(screen.getByText("Forgot password?"));
    type("Email", "a@b.co");
    await act(async () => submit());
    expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith("a@b.co", { redirectTo: `${location.origin}/` });
    expect(screen.getByText(/a reset link is on its way/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Forgot password?"));
    supabase.auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: { message: "Rate limited" } });
    await act(async () => submit());
    expect(screen.getByRole("alert")).toHaveTextContent("Rate limited");
  });

  it("shows 'Please wait…' while signing in", async () => {
    let finish!: (v: unknown) => void;
    supabase.auth.signInWithPassword.mockReturnValue(new Promise((r) => (finish = r)));
    renderScreen(<Login />);
    type("Email", "a@b.co");
    type("Password", "x");
    submit();
    expect(screen.getByText("Please wait…")).toBeDisabled();
    await act(async () => finish({ data: {}, error: null }));
  });
});

describe("Welcome", () => {
  beforeEach(() => signInAs("new"));

  it("saves who the account is for, with her name and timezone", async () => {
    supabase.auth.getUser.mockResolvedValue({ data: { user: { id: "new-1" } }, error: null });
    renderScreen(<Welcome />);
    const go = screen.getByText("Continue");
    expect(go).toBeDisabled();
    fireEvent.click(screen.getByText("I'm the partner"));
    fireEvent.click(screen.getByText("I'm tracking my cycle"));
    fireEvent.change(screen.getByLabelText("Your first name"), { target: { value: "Sonal" } });
    await act(async () => fireEvent.click(go));
    expect(fake.calls[0]).toMatchObject({ table: "rpc:set_role", payload: { p_role: "owner", p_name: "Sonal" } });
    expect(fake.writes("profiles", "update")[0].payload).toHaveProperty("timezone");
    expect(auth.refresh).toHaveBeenCalled();
  });

  it("skips the timezone without a user, and shows errors", async () => {
    renderScreen(<Welcome />);
    fireEvent.click(screen.getByText("I'm the partner"));
    fireEvent.change(screen.getByLabelText("Your first name"), { target: { value: "Mayur" } });
    fake.rpc.set_role = () => ({ data: null, error: { message: "Not allowed" } });
    await act(async () => fireEvent.click(screen.getByText("Continue")));
    expect(screen.getByText("Not allowed")).toBeInTheDocument();
    delete fake.rpc.set_role;
    await act(async () => fireEvent.click(screen.getByText("Continue")));
    expect(fake.writes("profiles")).toHaveLength(0);
    expect(auth.refresh).toHaveBeenCalled();
    fireEvent.click(screen.getByText("Sign out"));
    expect(auth.signOut).toHaveBeenCalled();
  });
});

describe("Join", () => {
  it("links with her invite code", async () => {
    signInAs("partner", { linked: false });
    renderScreen(<Join />);
    expect(screen.getByRole("heading", { name: "Hi Mayur" })).toBeInTheDocument();
    const input = screen.getByLabelText("Invite code");
    fireEvent.change(input, { target: { value: "ab-c2 34x9" } });
    expect(input).toHaveValue("ABC234");
    fake.rpc.redeem_invite = () => ({ data: null, error: { message: "Code expired" } });
    await act(async () => fireEvent.click(screen.getByText("Link accounts")));
    expect(screen.getByText("Code expired")).toBeInTheDocument();
    delete fake.rpc.redeem_invite;
    await act(async () => fireEvent.click(screen.getByText("Link accounts")));
    expect(fake.calls.at(-1)).toMatchObject({ table: "rpc:redeem_invite", payload: { p_code: "ABC234" } });
    expect(auth.refresh).toHaveBeenCalled();
    fireEvent.click(screen.getByText("Sign out"));
    expect(auth.signOut).toHaveBeenCalled();
  });

  it("says 'Hi there' without a name", () => {
    signInAs("partner", { linked: false });
    auth.profile = null;
    renderScreen(<Join />);
    expect(screen.getByRole("heading", { name: "Hi there" })).toBeInTheDocument();
    expect(screen.getByText("Link accounts")).toBeDisabled();
  });
});

describe("InstallGuide", () => {
  it("shows the iPhone steps on iPhone", () => {
    renderScreen(<InstallGuide />);
    expect(screen.getByText("Open this page in Safari")).toBeInTheDocument();
    expect(screen.getByText(/works best installed/)).toBeInTheDocument();
    expect(screen.queryByText(/different browser/)).toBeNull();
  });

  it("warns in other iPhone browsers, and knows when it's installed", () => {
    plat.nonSafari = true;
    plat.standalone = true;
    renderScreen(<InstallGuide />);
    expect(screen.getByText(/You're in a different browser/)).toBeInTheDocument();
    expect(screen.getByText("You're using the installed app ✓")).toBeInTheDocument();
  });

  it("shows Android steps with the install button when Chrome offers it", () => {
    plat.platform = "android";
    renderScreen(<InstallGuide />);
    expect(screen.getByText("Open this page in Chrome")).toBeInTheDocument();
    expect(screen.queryByText("Install Swarna now")).toBeNull();
    plat.canPrompt = true;
    act(() => plat.listeners.forEach((l) => l()));
    fireEvent.click(screen.getByText("Install Swarna now"));
    expect(plat.promptInstall).toHaveBeenCalled();
    fireEvent.click(screen.getByText("iPhone"));
    expect(screen.getByText("Open this page in Safari")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Android"));
    expect(screen.getByText("Open this page in Chrome")).toBeInTheDocument();
  });

  it("goes back, or home when opened directly", () => {
    const { unmount } = renderScreen(<InstallGuide />, "/install");
    fireEvent.click(screen.getByText("‹ Back"));
    unmount();
    vi.spyOn(history, "length", "get").mockReturnValue(1);
    renderScreen(<InstallGuide />, "/install");
    fireEvent.click(screen.getByText("‹ Back"));
    expect(screen.getByTestId("where")).toHaveTextContent(/^\/$/);
    expect(plat.listeners.size).toBe(1); // the first guide stopped listening
  });
});

