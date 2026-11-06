import { format, parseISO } from "date-fns";
import { ChevronRight, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";

/**
 * Today: "Invite your partner" until she links someone. Shows "code pending"
 * while an unused code is waiting, and can be dismissed (per phone).
 */
export default function InviteHint({ ownerId }: { ownerId: string }) {
  const dismissKey = `swarna.inviteHint.${ownerId}`;
  const cacheKey = `swarna.invite.${ownerId}`;
  const read = <T,>(k: string, fallback: T): T => {
    try {
      const v = localStorage.getItem(k);
      return v === null ? fallback : (JSON.parse(v) as T);
    } catch {
      return fallback;
    }
  };
  const [dismissed, setDismissed] = useState(() => read(dismissKey, false));
  // Cached so the card shows the right text straight away (and offline).
  const [pending, setPending] = useState<{ code: string; expires_at: string } | null>(
    () => read(cacheKey, null),
  );

  useEffect(() => {
    if (dismissed) return;
    supabase
      .from("invite_codes")
      .select("code, expires_at")
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) return; // offline: keep the cached copy
        setPending(data);
        try {
          localStorage.setItem(cacheKey, JSON.stringify(data));
        } catch {
          /* ignore */
        }
      });
  }, [dismissed, cacheKey]);

  if (dismissed) return null;
  const live = pending && pending.expires_at > new Date().toISOString() ? pending : null;

  return (
    <div className="card hint invite-hint">
      <Link to="/settings" className="row-between">
        <span>
          <strong>{live ? `Invite code pending · ${live.code}` : "Invite your partner"}</strong>
          <span className="muted small block">
            {live
              ? `Waiting for your partner to enter it · expires ${format(parseISO(live.expires_at), "d MMM")}`
              : "Share only what you choose"}
          </span>
        </span>
        <ChevronRight size={18} />
      </Link>
      <button
        className="icon-btn hint-close"
        aria-label="Hide this card"
        onClick={() => {
          setDismissed(true);
          try {
            localStorage.setItem(dismissKey, "true");
          } catch {
            /* ignore */
          }
        }}
      >
        <X size={16} />
      </button>
    </div>
  );
}
