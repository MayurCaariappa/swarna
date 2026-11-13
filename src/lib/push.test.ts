import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Supabase and the platform checks are faked; the browser push APIs are stubbed per test.
const db = vi.hoisted(() => ({
  upsert: vi.fn(),
  eq: vi.fn(),
  invoke: vi.fn(),
  from: vi.fn(),
}));
vi.mock("./supabase", () => ({
  supabase: {
    from: db.from,
    functions: { invoke: db.invoke },
  },
}));
const plat = vi.hoisted(() => ({ isIOS: false, standalone: true }));
vi.mock("./platform", () => ({
  get isIOS() {
    return plat.isIOS;
  },
  isStandalone: () => plat.standalone,
}));

const sub = {
  endpoint: "https://push.example/1",
  toJSON: () => ({ keys: { p256dh: "p", auth: "a" } }),
  unsubscribe: vi.fn().mockResolvedValue(true),
};
const pushManager = { getSubscription: vi.fn(), subscribe: vi.fn() };

async function load(vapid = "BCd-_x") {
  vi.resetModules();
  vi.stubEnv("VITE_VAPID_PUBLIC_KEY", vapid);
  return import("./push");
}
function stubBrowser(permission: NotificationPermission, request: NotificationPermission = permission) {
  vi.stubGlobal("Notification", { permission, requestPermission: vi.fn().mockResolvedValue(request) });
  vi.stubGlobal("PushManager", function () {});
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      getRegistration: vi.fn().mockResolvedValue({ pushManager }),
      ready: Promise.resolve({ pushManager }),
    },
  });
}

beforeEach(() => {
  plat.isIOS = false;
  plat.standalone = true;
  db.upsert.mockResolvedValue({ error: null });
  db.eq.mockResolvedValue({ error: null });
  db.from.mockReturnValue({ upsert: db.upsert, delete: () => ({ eq: db.eq }) });
  pushManager.getSubscription.mockResolvedValue(sub);
  pushManager.subscribe.mockResolvedValue(sub);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  delete (navigator as { serviceWorker?: unknown }).serviceWorker;
});

describe("getPushState", () => {
  it("needs the Home Screen app on iPhone", async () => {
    plat.isIOS = true;
    plat.standalone = false;
    expect(await (await load()).getPushState()).toBe("needs-install");
  });
  it("is unsupported without push APIs or a key", async () => {
    expect(await (await load()).getPushState()).toBe("unsupported");
    stubBrowser("granted");
    expect(await (await load("")).getPushState()).toBe("unsupported");
  });
  it("reports denied / on / off", async () => {
    const push = await load();
    stubBrowser("denied");
    expect(await push.getPushState()).toBe("denied");
    stubBrowser("granted");
    expect(await push.getPushState()).toBe("on");
    pushManager.getSubscription.mockResolvedValue(null);
    expect(await push.getPushState()).toBe("off");
    stubBrowser("default");
    pushManager.getSubscription.mockResolvedValue(sub);
    expect(await push.getPushState()).toBe("off");
  });
});

describe("enablePush", () => {
  it("subscribes and saves the device", async () => {
    const push = await load();
    stubBrowser("default", "granted");
    pushManager.getSubscription.mockResolvedValue(null);
    expect(await push.enablePush()).toBe("on");
    const opts = pushManager.subscribe.mock.calls[0][0];
    expect(opts.userVisibleOnly).toBe(true);
    expect(opts.applicationServerKey).toBeInstanceOf(Uint8Array);
    expect(db.from).toHaveBeenCalledWith("push_subscriptions");
    expect(db.upsert.mock.calls[0][0]).toMatchObject({ endpoint: sub.endpoint, p256dh: "p", auth: "a" });
  });
  it("reuses an existing subscription and saves empty keys if missing", async () => {
    const push = await load();
    stubBrowser("default", "granted");
    pushManager.getSubscription.mockResolvedValue({ ...sub, toJSON: () => ({}) });
    expect(await push.enablePush()).toBe("on");
    expect(pushManager.subscribe).not.toHaveBeenCalled();
    expect(db.upsert.mock.calls[0][0]).toMatchObject({ p256dh: "", auth: "" });
  });
  it("returns denied / off when not allowed", async () => {
    const push = await load();
    stubBrowser("default", "denied");
    expect(await push.enablePush()).toBe("denied");
    stubBrowser("default", "default");
    expect(await push.enablePush()).toBe("off");
  });
  it("throws if saving fails", async () => {
    const push = await load();
    stubBrowser("default", "granted");
    db.upsert.mockResolvedValue({ error: new Error("rls") });
    await expect(push.enablePush()).rejects.toThrow("rls");
  });
});

describe("disablePush", () => {
  it("removes the device", async () => {
    const push = await load();
    stubBrowser("granted");
    expect(await push.disablePush()).toBe("off");
    expect(db.eq).toHaveBeenCalledWith("endpoint", sub.endpoint);
    expect(sub.unsubscribe).toHaveBeenCalled();
  });
  it("does nothing without a subscription", async () => {
    const push = await load();
    stubBrowser("granted");
    pushManager.getSubscription.mockResolvedValue(null);
    expect(await push.disablePush()).toBe("off");
    expect(db.eq).not.toHaveBeenCalled();
  });
});

describe("refreshPushSubscription", () => {
  it("re-saves an existing subscription, ignoring errors", async () => {
    const push = await load();
    stubBrowser("granted");
    db.upsert.mockResolvedValue({ error: new Error("offline") });
    await expect(push.refreshPushSubscription()).resolves.toBeUndefined();
    expect(db.upsert).toHaveBeenCalledTimes(1);
  });
  it("skips without permission or subscription", async () => {
    const push = await load();
    stubBrowser("default");
    await push.refreshPushSubscription();
    stubBrowser("granted");
    pushManager.getSubscription.mockResolvedValue(null);
    await push.refreshPushSubscription();
    expect(db.upsert).not.toHaveBeenCalled();
  });
});

describe("sendTestPush", () => {
  it("returns how many devices got it", async () => {
    const push = await load();
    db.invoke.mockResolvedValue({ data: { delivered: 2 }, error: null });
    expect(await push.sendTestPush()).toBe(2);
    expect(db.invoke).toHaveBeenCalledWith("send-reminders", { body: { test: true } });
    db.invoke.mockResolvedValue({ data: null, error: null });
    expect(await push.sendTestPush()).toBe(0);
    db.invoke.mockResolvedValue({ data: null, error: new Error("401") });
    await expect(push.sendTestPush()).rejects.toThrow("401");
  });
});
