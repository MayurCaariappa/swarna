import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** False until .env.local (or Vercel env vars) are filled in. */
export const supabaseConfigured = Boolean(url && key);

export const supabase = createClient(
  url ?? "http://localhost:54321",
  key ?? "not-configured",
  {
    auth: {
      persistSession: true, // session lives in this app's storage, so it works offline
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: "swarna.auth",
    },
  },
);

/** Turn a Supabase/Postgres error into a sentence for the UI. */
export function errorMessage(err: unknown): string {
  if (!err) return "Something went wrong";
  if (typeof err === "string") return err;
  if (
    typeof err === "object" &&
    "message" in err &&
    typeof err.message === "string"
  ) {
    if (err.message === "Failed to fetch")
      return "Can't reach the server — check your connection.";
    return err.message;
  }
  return "Something went wrong";
}
