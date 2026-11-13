import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearLocalData, db, DEFAULT_TRACKING, EMPTY_DAILY_LOG, type TrackingRow } from "./db";

// A small stand-in for Supabase: upserts are recorded, selects return `remote`.
const fake = vi.hoisted(() => {
  const state = {
    remote: {} as Record<string, Record<string, unknown>[] | null>,
    upsertError: null as Error | null,
    pullError: null as Error | null,
    upserts: [] as { table: string; rows: Record<string, unknown>[] }[],
    gte: [] as string[],
    onUpsert: null as null | (() => Promise<void>),
    realtime: [] as (() => void)[],
    removed: 0,
  };
  const supabase = {
    from(table: string) {
      return {
        async upsert(rows: Record<string, unknown>[]) {
          state.upserts.push({ table, rows });
          await state.onUpsert?.();
          return { error: state.upsertError };
        },
        select() {
          const q = {
            eq: () => q,
            order: () => q,
            limit: () => q,
            gte: (_c: string, v: string) => {
              state.gte.push(v);
              return q;
            },
            then: (ok: (r: unknown) => void) =>
              ok({ data: state.remote[table] ?? [], error: state.pullError }),
          };
          return q;
        },
      };
    },
    channel() {
      const ch = {
        on: (_e: string, _f: unknown, cb: () => void) => {
          state.realtime.push(cb);
          return ch;
        },
        subscribe: () => ch,
      };
      return ch;
    },
    removeChannel: async () => {
      state.removed++;
    },
  };
  return { state, supabase };
});
vi.mock("../lib/supabase", () => ({ supabase: fake.supabase }));

import { requestSync, startSync, syncNow, useSyncStatus } from "./sync";

const ME = "owner-1";
const T0 = "2026-11-10T08:00:00.000Z";
const T1 = "2026-11-10T09:00:00.000Z";
const tracking = (patch: Partial<TrackingRow> = {}): TrackingRow => ({
  ...DEFAULT_TRACKING,
  owner_id: ME,
  updated_at: T0,
  dirty: 1,
  ...patch,
});

let stop: (() => void) | null = null;
beforeEach(() => {
  Object.assign(fake.state, {
    remote: {},
    upsertError: null,
    pullError: null,
    upserts: [],
    gte: [],
    onUpsert: null,
    realtime: [],
    removed: 0,
  });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
/** Let a queued follow-up sync finish (it runs right after the current one). */
const settle = () => new Promise((r) => setTimeout(r, 30));

afterEach(async () => {
  await settle();
  stop?.();
  stop = null;
  await syncNow(); // let any queued run finish
  await clearLocalData();
});

/** Start syncing and wait for the first run to finish. */
async function start() {
  stop = startSync(ME);
  await syncNow();
  await settle();
}

describe("syncNow", () => {
  it("does nothing before sign-in or offline", async () => {
    await db.tracking.put(tracking());
    await syncNow();
    expect(fake.state.upserts).toEqual([]);

    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    stop = startSync(ME);
    await syncNow();
    expect(fake.state.upserts).toEqual([]);
  });

  it("uploads changed rows without the dirty flag, then marks them clean", async () => {
    await db.tracking.put(tracking());
    await db.pillLogs.put({ owner_id: ME, date: "2026-11-09", taken_at: T0, deleted: false, updated_at: T0, dirty: 0 });
    await db.pillLogs.put({ owner_id: ME, date: "2026-11-10", taken_at: T0, deleted: false, updated_at: T0, dirty: 1 });
    await db.dailyLogs.put({ ...EMPTY_DAILY_LOG, owner_id: ME, date: "2026-11-10", deleted: false, updated_at: T0, dirty: 1 });
    await start();
    expect(fake.state.upserts.map((u) => [u.table, u.rows.length])).toEqual([
      ["tracking_settings", 1],
      ["pill_logs", 1],
      ["daily_logs", 1],
    ]);
    expect((await db.pillLogs.get([ME, "2026-11-10"]))!.dirty).toBe(0);
    expect((await db.dailyLogs.get([ME, "2026-11-10"]))!.dirty).toBe(0);
    expect(fake.state.upserts[0].rows[0]).not.toHaveProperty("dirty");
    expect((await db.tracking.get(ME))!.dirty).toBe(0);
  });

  it("re-uploads a row that changed again during the upload", async () => {
    await db.tracking.put(tracking());
    let edits = 0;
    fake.state.onUpsert = async () => {
      if (edits++ === 0) await db.tracking.update(ME, { updated_at: T1, reminder_time: "08:00" });
    };
    stop = startSync(ME);
    await syncNow();
    // Still dirty after the first upload, so a second one sends the new time.
    await waitFor(() => expect(fake.state.upserts).toHaveLength(2));
    expect(fake.state.upserts[1].rows[0]).toMatchObject({ reminder_time: "08:00" });
    await waitFor(async () => expect((await db.tracking.get(ME))!.dirty).toBe(0));
  });

  it("downloads new rows and remembers where it got to", async () => {
    fake.state.remote.periods = [
      { id: "p1", owner_id: ME, start_date: "2026-11-01", end_date: null, deleted: false, updated_at: T0, synced_at: "2026-11-10T10:00:00.000Z" },
    ];
    await start();
    expect(await db.periods.get("p1")).toMatchObject({ start_date: "2026-11-01", dirty: 0 });
    expect(await db.periods.get("p1")).not.toHaveProperty("synced_at");
    expect((await db.meta.get(`pull:periods:${ME}`))!.value).toBe("2026-11-10T10:00:00.000Z");

    // Next pull asks only for newer rows (with 5 s overlap).
    await syncNow();
    expect(fake.state.gte).toContain("2026-11-10T09:59:55.000Z");
  });

  it("keeps her newer unsent change over an older server copy, but not an older one", async () => {
    const remoteRow = (updated_at: string) => ({
      ...tracking({ updated_at, reminder_time: "07:00" }),
      dirty: undefined,
      synced_at: T1,
    });
    // Newer on the phone (still dirty because the upload keeps failing).
    fake.state.upsertError = new Error("offline");
    await db.tracking.put(tracking({ updated_at: T1, reminder_time: "22:00" }));
    fake.state.remote.tracking_settings = [remoteRow(T0)];
    await start();
    expect((await db.tracking.get(ME))!.reminder_time).toBe("22:00");
  });

  it("lets a newer server copy win over an older local edit", async () => {
    fake.state.onUpsert = async () => {
      await db.tracking.update(ME, { updated_at: T0, reminder_time: "22:30" });
    };
    await db.tracking.put(tracking({ updated_at: "2026-11-10T07:00:00.000Z" }));
    fake.state.remote.tracking_settings = [{ ...tracking({ updated_at: T1, reminder_time: "07:00" }), synced_at: T1 }];
    await start();
    expect(await db.tracking.get(ME)).toMatchObject({ reminder_time: "07:00", dirty: 0 });
  });

  it("treats a missing server list as empty", async () => {
    fake.state.remote.daily_logs = null;
    await start();
    expect(await db.dailyLogs.count()).toBe(0);
  });

  it("reports errors and pending changes", async () => {
    await db.tracking.put(tracking());
    fake.state.upsertError = new Error("rls");
    const { result } = renderHook(() => useSyncStatus());
    await act(start);
    expect(result.current).toMatchObject({ state: "error", pending: true });

    fake.state.upsertError = null;
    fake.state.pullError = new Error("timeout");
    await act(() => syncNow());
    expect(result.current.state).toBe("error");

    fake.state.pullError = null;
    await act(() => syncNow());
    expect(result.current).toMatchObject({ state: "idle", pending: false });
    expect(result.current.lastSyncedAt).toEqual(expect.any(Number));
  });

  it("runs once more when asked during a sync", async () => {
    stop = startSync(ME); // first run starts
    const second = syncNow(); // joins it, and queues another
    await db.tracking.put(tracking());
    await second;
    await waitFor(async () => expect((await db.tracking.get(ME))!.dirty).toBe(0));
  });
});

describe("startSync", () => {
  it("syncs on wake, online and realtime changes, and stops cleanly", async () => {
    await start();
    expect(fake.state.realtime).toHaveLength(4);

    await db.tracking.put(tracking());
    window.dispatchEvent(new Event("online"));
    await waitFor(async () => expect((await db.tracking.get(ME))!.dirty).toBe(0));

    await db.tracking.put(tracking({ updated_at: T1 }));
    document.dispatchEvent(new Event("visibilitychange"));
    await waitFor(async () => expect((await db.tracking.get(ME))!.dirty).toBe(0));

    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    const before = fake.state.upserts.length;
    await db.tracking.put(tracking({ updated_at: "2026-11-10T10:00:00.000Z" }));
    window.dispatchEvent(new Event("online"));
    await new Promise((r) => setTimeout(r, 50));
    expect(fake.state.upserts.length).toBe(before); // hidden: no sync

    fake.state.realtime[0](); // a change on another device → debounced sync
    await waitFor(() => expect(fake.state.upserts.length).toBe(before + 1), { timeout: 2000 });

    stop!();
    stop = null;
    expect(fake.state.removed).toBe(1);
  });

  it("checks every minute", async () => {
    vi.useFakeTimers({ toFake: ["setInterval"] });
    await start();
    await db.tracking.put(tracking());
    vi.advanceTimersByTime(60_000);
    vi.useRealTimers();
    await waitFor(async () => expect((await db.tracking.get(ME))!.dirty).toBe(0));
  });
});

describe("requestSync", () => {
  it("batches rapid writes into one upload", async () => {
    await start();
    await db.tracking.put(tracking());
    requestSync();
    requestSync();
    await waitFor(() => expect(fake.state.upserts).toHaveLength(1), { timeout: 2000 });
  });
});
