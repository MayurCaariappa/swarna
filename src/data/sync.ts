import type { Table } from "dexie";
import { useSyncExternalStore } from "react";
import { supabase } from "../lib/supabase";
import { db } from "./db";

// Two-way sync between the phone (Dexie) and Supabase.
//  push: upload rows marked dirty
//  pull: download rows the server got since our last pull (by synced_at)
// Conflicts: whichever change has the newer updated_at wins (also enforced
// server-side by the keep_newest trigger).

interface SyncedRow {
  owner_id: string;
  updated_at: string;
  dirty: 0 | 1;
}

interface Spec {
  remote: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  local: Table<any, any>;
  onConflict: string;
  columns: string;
  key: (r: Record<string, unknown>) => unknown;
}

const SPECS: Spec[] = [
  {
    remote: "tracking_settings",
    local: db.tracking,
    onConflict: "owner_id",
    columns:
      "owner_id, mode, pack_start_date, active_days, break_days, reminder_time, natural_since, updated_at, synced_at",
    key: (r) => r.owner_id,
  },
  {
    remote: "pill_logs",
    local: db.pillLogs,
    onConflict: "owner_id,date",
    columns: "owner_id, date, taken_at, deleted, updated_at, synced_at",
    key: (r) => [r.owner_id, r.date],
  },
  {
    remote: "periods",
    local: db.periods,
    onConflict: "id",
    columns:
      "id, owner_id, start_date, end_date, deleted, updated_at, synced_at",
    key: (r) => r.id,
  },
];

// ── status, for the UI ──
export interface SyncStatus {
  state: "idle" | "syncing" | "error";
  lastSyncedAt: number | null;
  pending: boolean;
}
let status: SyncStatus = { state: "idle", lastSyncedAt: null, pending: false };
const statusListeners = new Set<() => void>();
function setStatus(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch };
  statusListeners.forEach((l) => l());
}
export function useSyncStatus() {
  return useSyncExternalStore(
    (cb) => {
      statusListeners.add(cb);
      return () => statusListeners.delete(cb);
    },
    () => status,
  );
}

const time = (iso: string) => Date.parse(iso);

async function push(spec: Spec) {
  const rows: SyncedRow[] = await spec.local.where("dirty").equals(1).toArray();
  if (rows.length === 0) return;
  const payload = rows.map(({ dirty: _dirty, ...rest }) => rest);
  const { error } = await supabase
    .from(spec.remote)
    .upsert(payload, { onConflict: spec.onConflict });
  if (error) throw error;
  // Clear the flag, unless the row was edited again while we were uploading.
  await db.transaction("rw", spec.local, async () => {
    for (const row of rows) {
      const key = spec.key(row as unknown as Record<string, unknown>);
      const current: SyncedRow | undefined = await spec.local.get(key);
      if (current && current.updated_at === row.updated_at)
        await spec.local.update(key, { dirty: 0 });
    }
  });
}

async function pull(spec: Spec, ownerId: string) {
  const cursorKey = `pull:${spec.remote}:${ownerId}`;
  const cursor = (await db.meta.get(cursorKey))?.value;
  let query = supabase
    .from(spec.remote)
    .select(spec.columns)
    .eq("owner_id", ownerId)
    .order("synced_at", { ascending: true })
    .limit(1000);
  // Re-fetch a few seconds of overlap so nothing committed late is missed.
  if (cursor)
    query = query.gte("synced_at", new Date(time(cursor) - 5000).toISOString());
  const { data, error } = await query;
  if (error) throw error;
  const remoteRows = (data ?? []) as unknown as (Record<string, unknown> & {
    synced_at: string;
    updated_at: string;
  })[];
  if (remoteRows.length === 0) return;

  await db.transaction("rw", spec.local, db.meta, async () => {
    for (const { synced_at: _s, ...remote } of remoteRows) {
      const local: SyncedRow | undefined = await spec.local.get(
        spec.key(remote),
      );
      const keepLocal =
        local?.dirty === 1 &&
        time(local.updated_at) > time(remote.updated_at as string);
      if (!keepLocal) await spec.local.put({ ...remote, dirty: 0 });
    }
    await db.meta.put({
      key: cursorKey,
      value: remoteRows[remoteRows.length - 1].synced_at,
    });
  });
}

// ── the engine ──
let ownerId: string | null = null;
let running: Promise<void> | null = null;
let again = false;

export async function syncNow(): Promise<void> {
  if (!ownerId || !navigator.onLine) return;
  if (running) {
    again = true; // a change came in mid-sync; run once more afterwards
    return running;
  }
  const id = ownerId;
  running = (async () => {
    setStatus({ state: "syncing" });
    try {
      for (const spec of SPECS) {
        await push(spec);
        await pull(spec, id);
      }
      setStatus({ state: "idle", lastSyncedAt: Date.now() });
    } catch (err) {
      console.warn("Sync failed — will retry", err);
      setStatus({ state: "error" });
    } finally {
      running = null;
      await refreshPending();
      if (again) {
        again = false;
        void syncNow();
      }
    }
  })();
  return running;
}

async function refreshPending() {
  const counts = await Promise.all(
    SPECS.map((s) => s.local.where("dirty").equals(1).count()),
  );
  setStatus({ pending: counts.some((c) => c > 0) });
}

let timer: ReturnType<typeof setTimeout> | undefined;
/** Call after every local write. Batches rapid taps into one upload. */
export function requestSync() {
  void refreshPending();
  clearTimeout(timer);
  timer = setTimeout(() => void syncNow(), 300);
}

/** Start syncing for this owner. Returns a stop function. */
export function startSync(id: string) {
  ownerId = id;
  const onWake = () => {
    if (document.visibilityState === "visible") void syncNow();
  };
  window.addEventListener("online", onWake);
  document.addEventListener("visibilitychange", onWake);
  const interval = setInterval(onWake, 60_000);

  // Changes made on another device (e.g. her second phone or the web).
  const channel = supabase.channel(`sync-${id}`);
  for (const spec of SPECS) {
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: spec.remote,
        filter: `owner_id=eq.${id}`,
      },
      () => requestSync(),
    );
  }
  channel.subscribe();

  void syncNow();

  return () => {
    ownerId = null;
    window.removeEventListener("online", onWake);
    document.removeEventListener("visibilitychange", onWake);
    clearInterval(interval);
    void supabase.removeChannel(channel);
  };
}
