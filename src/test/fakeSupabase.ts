import { vi } from "vitest";

// A stand-in for the Supabase client used by screen tests. Reads return
// `fake.tables[table]`; every call is recorded in `fake.calls` so tests can
// check what was written. Set `fake.errors[table]` to make a table fail.

export interface Call {
  table: string;
  op: "select" | "insert" | "upsert" | "update" | "delete";
  payload?: unknown;
  filters: [string, ...unknown[]][];
}

type Result = { data: unknown; error: unknown };

// One shared instance, even when a test reloads modules (vi.resetModules).
function build() {


const fakeState = {
  tables: {} as Record<string, unknown>,
  errors: {} as Record<string, unknown>,
  calls: [] as Call[],
  rpc: {} as Record<string, (args: unknown) => Result | Promise<Result>>,
  realtime: [] as (() => void)[],
  removedChannels: 0,
  /** Set to hold every query until released (to test loading states). */
  gate: null as Promise<void> | null,
  reset() {
    this.tables = {};
    this.errors = {};
    this.calls = [];
    this.rpc = {};
    this.realtime = [];
    this.removedChannels = 0;
    this.gate = null;
    auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    auth.onAuthStateChange.mockImplementation(() => ({
      data: { subscription: { unsubscribe: vi.fn() } },
    }));
    for (const fn of [auth.signInWithPassword, auth.signUp, auth.resetPasswordForEmail, auth.signOut])
      fn.mockResolvedValue({ data: {}, error: null });
    functions.invoke.mockResolvedValue({ data: null, error: null });
  },
  writes(table: string, op?: Call["op"]) {
    return this.calls.filter((c) => c.table === table && c.op !== "select" && (!op || c.op === op));
  },
};

function query(table: string) {
  const call: Call = { table, op: "select", filters: [] };
  let mode: "many" | "single" | "maybe" = "many";
  const q = {
    select: () => q,
    insert: (payload: unknown) => ((call.op = "insert"), (call.payload = payload), q),
    upsert: (payload: unknown) => ((call.op = "upsert"), (call.payload = payload), q),
    update: (payload: unknown) => ((call.op = "update"), (call.payload = payload), q),
    delete: () => ((call.op = "delete"), q),
    single: () => ((mode = "single"), q),
    maybeSingle: () => ((mode = "maybe"), q),
    then(ok: (r: Result) => unknown, fail?: (e: unknown) => unknown) {
      fakeState.calls.push(call);
      const run = async (): Promise<Result> => {
        if (fakeState.gate) await fakeState.gate;
        const error = fakeState.errors[table] ?? null;
        if (error) return { data: null, error };
        if (call.op !== "select") return { data: null, error: null };
        const data = fakeState.tables[table];
        if (mode === "many") return { data: data ?? [], error: null };
        return { data: Array.isArray(data) ? (data[0] ?? null) : (data ?? null), error: null };
      };
      return run().then(ok, fail);
    },
  };
  for (const f of ["eq", "neq", "or", "gte", "lte", "gt", "lt", "is", "in", "order", "limit"])
    (q as Record<string, unknown>)[f] = (...args: unknown[]) => {
      call.filters.push([f, ...args]);
      return q;
    };
  return q;
}

const auth = {
  getSession: vi.fn(),
  getUser: vi.fn(),
  onAuthStateChange: vi.fn(),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  signOut: vi.fn(),
};
const functions = { invoke: vi.fn() };

const client = {
  from: (table: string) => query(table),
  rpc: async (name: string, args?: unknown) => {
    fakeState.calls.push({ table: `rpc:${name}`, op: "insert", payload: args, filters: [] });
    return (await fakeState.rpc[name]?.(args)) ?? { data: null, error: null };
  },
  channel() {
    const ch = {
      on: (_e: string, _f: unknown, cb: () => void) => {
        fakeState.realtime.push(cb);
        return ch;
      },
      subscribe: () => ch,
    };
    return ch;
  },
  removeChannel: async () => {
    fakeState.removedChannels++;
  },
  auth,
  functions,
};


  return { fake: fakeState, supabase: client };
}

const g = globalThis as { __swarnaFake?: ReturnType<typeof build> };
g.__swarnaFake ??= build();
export const fake = g.__swarnaFake.fake;
export const supabase = g.__swarnaFake.supabase;
fake.reset();
