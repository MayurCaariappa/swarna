/* eslint-disable react-refresh/only-export-components -- test helpers, not hot-reloaded */
import { render } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { vi } from "vitest";
import { ConfirmProvider } from "../components/ui/Confirm";
import { ToastProvider } from "../components/ui/Toast";
import type { PartnerLink, Profile } from "../lib/types";

// The signed-in user as screens see it (useAuth is replaced by this in tests).
export const OWNER_ID = "owner-1";
export const PARTNER_ID = "partner-1";

export const sonal: Profile = { id: OWNER_ID, role: "owner", display_name: "Sonal", timezone: "Europe/London" };
export const mayur: Profile = { id: PARTNER_ID, role: "partner", display_name: "Mayur", timezone: "Europe/London" };
export const link: PartnerLink = { owner_id: OWNER_ID, partner_id: PARTNER_ID, created_at: "2026-11-01T00:00:00Z" };

const session = (id: string) => ({
  access_token: "a",
  refresh_token: "r",
  user: { id, email: `${id}@example.com` },
});

export const auth = {
  session: null as ReturnType<typeof session> | null,
  profile: null as Profile | null,
  link: null as PartnerLink | null,
  counterpart: null as Profile | null,
  loading: false,
  refresh: vi.fn(async () => {}),
  signOut: vi.fn(async () => {}),
};

export function signInAs(who: "owner" | "partner" | "new", opts: { linked?: boolean } = {}) {
  const linked = opts.linked ?? true;
  auth.loading = false;
  if (who === "new") {
    Object.assign(auth, { session: session("new-1"), profile: { ...sonal, id: "new-1", role: null }, link: null, counterpart: null });
  } else if (who === "owner") {
    Object.assign(auth, { session: session(OWNER_ID), profile: sonal, link: linked ? link : null, counterpart: linked ? mayur : null });
  } else {
    Object.assign(auth, { session: session(PARTNER_ID), profile: mayur, link: linked ? link : null, counterpart: linked ? sonal : null });
  }
}

export function signOutAll() {
  Object.assign(auth, { session: null, profile: null, link: null, counterpart: null, loading: false });
}

/** Shows the current URL, so tests can check navigation. */
function Where() {
  const loc = useLocation();
  return <output data-testid="where">{loc.pathname + loc.search}</output>;
}

export function Providers({ children, route = "/" }: { children: ReactNode; route?: string }) {
  return (
    <MemoryRouter initialEntries={[route]}>
      <ConfirmProvider>
        <ToastProvider>
          {children}
          <Routes>
            <Route path="*" element={<Where />} />
          </Routes>
        </ToastProvider>
      </ConfirmProvider>
    </MemoryRouter>
  );
}

export function renderScreen(ui: ReactElement, route = "/") {
  return render(ui, { wrapper: ({ children }) => <Providers route={route}>{children}</Providers> });
}
