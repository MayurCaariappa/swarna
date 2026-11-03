import type { Session } from "@supabase/supabase-js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { supabase, supabaseConfigured } from "../lib/supabase";
import type { PartnerLink, Profile } from "../lib/types";

interface Account {
  profile: Profile | null;
  link: PartnerLink | null;
  /** The other person: her partner, or the partner's owner. */
  counterpart: Profile | null;
}

interface AuthState extends Account {
  session: Session | null;
  /** True only on the very first load, before we know if anyone is signed in. */
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

const EMPTY: Account = { profile: null, link: null, counterpart: null };

// The account is cached on the phone so the app opens instantly — and offline.
const cacheKey = (uid: string) => `swarna.account.${uid}`;

function readCache(uid: string): Account | null {
  try {
    const raw = localStorage.getItem(cacheKey(uid));
    return raw ? (JSON.parse(raw) as Account) : null;
  } catch {
    return null;
  }
}

function writeCache(uid: string, account: Account) {
  try {
    localStorage.setItem(cacheKey(uid), JSON.stringify(account));
  } catch {
    /* storage full / blocked — not fatal */
  }
}

async function fetchAccount(uid: string): Promise<Account> {
  const [{ data: profile, error: pErr }, { data: link, error: lErr }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id, role, display_name, timezone")
        .eq("id", uid)
        .single(),
      supabase
        .from("partner_links")
        .select("owner_id, partner_id, created_at")
        .or(`owner_id.eq.${uid},partner_id.eq.${uid}`)
        .maybeSingle(),
    ]);
  if (pErr) throw pErr;
  if (lErr) throw lErr;

  let counterpart: Profile | null = null;
  if (link) {
    const otherId = link.owner_id === uid ? link.partner_id : link.owner_id;
    const { data } = await supabase
      .from("profiles")
      .select("id, role, display_name, timezone")
      .eq("id", otherId)
      .maybeSingle();
    counterpart = data;
  }
  return { profile, link, counterpart };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [account, setAccount] = useState<Account>(EMPTY);
  const [loading, setLoading] = useState(supabaseConfigured);

  const uid = session?.user.id;

  const load = useCallback(async (userId: string) => {
    try {
      const fresh = await fetchAccount(userId);
      setAccount(fresh);
      writeCache(userId, fresh);
    } catch {
      // Offline or server unreachable: keep whatever we have cached.
    }
  }, []);

  // Track sign-in state.
  useEffect(() => {
    if (!supabaseConfigured) return;
    supabase.auth.getSession().then(({ data }) => {
      const s = data.session;
      setSession(s);
      if (s) {
        const cached = readCache(s.user.id);
        if (cached) setAccount(cached);
        // If we have a cache, show the app right away and refresh in the background.
        if (cached) setLoading(false);
        load(s.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "SIGNED_IN" && s) load(s.user.id);
      if (event === "SIGNED_OUT") setAccount(EMPTY);
    });
    return () => sub.subscription.unsubscribe();
  }, [load]);

  // Notice instantly when the partner link is created or removed, and
  // re-check whenever the app comes back to the foreground.
  useEffect(() => {
    if (!uid) return;
    const channel = supabase
      .channel(`links-${uid}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "partner_links" },
        () => load(uid),
      )
      .subscribe();
    const onVisible = () => document.visibilityState === "visible" && load(uid);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [uid, load]);

  const value = useMemo<AuthState>(
    () => ({
      session,
      loading,
      ...account,
      refresh: async () => {
        if (uid) await load(uid);
      },
      signOut: async () => {
        if (uid) localStorage.removeItem(cacheKey(uid));
        await supabase.auth.signOut();
      },
    }),
    [session, loading, account, uid, load],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
