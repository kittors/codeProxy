import { beforeEach, describe, expect, test, vi } from "vitest";

const getMock = vi.fn();
const putMock = vi.fn();

vi.mock("../../client/client", () => ({
  apiClient: { get: getMock, put: putMock },
}));

const info = {
  persistent: true,
  updated_at: "2026-11-01T01:02:03Z",
  defaults: { reply_window: 256, reply_max_distinct: 24, tool_repeats: 8 },
  bounds: {
    min_reply_window: 64,
    max_reply_window: 2048,
    min_reply_distinct: 2,
    reply_distinct_window_share: 4,
    min_tool_repeats: 3,
    max_tool_repeats: 32,
  },
};

const tenantPayload = {
  reply: { enabled: true, window: 128, max_distinct: 0 },
  tool: { enabled: false, repeats: 0 },
  key_overrides: 2,
  ...info,
};

const keyPayload = {
  key_id: "key-1",
  reply: { enabled: null, window: 0, max_distinct: 0 },
  tool: { enabled: false, repeats: 5 },
  tenant: {
    reply: { enabled: true, window: 128, max_distinct: 0 },
    tool: { enabled: true, repeats: 0 },
  },
  effective: {
    reply: { enabled: true, source: "tenant", window: 128, max_distinct: 24 },
    tool: { enabled: false },
  },
  ...info,
};

describe("normalizeLoopGuardTenant", () => {
  test("reads the tenant's own settings and what the backend enforces", async () => {
    const { normalizeLoopGuardTenant } = await import("../loop-guard");

    expect(normalizeLoopGuardTenant(tenantPayload)).toEqual({
      reply: { enabled: true, window: 128, max_distinct: 0 },
      tool: { enabled: false, repeats: 0 },
      key_overrides: 2,
      ...info,
    });
  });

  // GET /loop-guard is the panel's probe: anything that does not carry the shape of
  // the backend's answer is a backend (or a proxy page) without the feature.
  test.each<[string, unknown]>([
    ["nothing", undefined],
    ["null", null],
    ["a string", "ok"],
    ["an array", [tenantPayload]],
    ["no reply section", { ...tenantPayload, reply: undefined }],
    ["no tool section", { ...tenantPayload, tool: null }],
    ["no defaults", { ...tenantPayload, defaults: undefined }],
    ["no bounds", { ...tenantPayload, bounds: "wide" }],
    ["no persistent flag", { ...tenantPayload, persistent: "yes" }],
  ])("is not loop protection when it is %s", async (_name, raw) => {
    const { normalizeLoopGuardTenant } = await import("../loop-guard");

    expect(normalizeLoopGuardTenant(raw)).toBeNull();
  });

  test("never lets a bad number or flag through", async () => {
    const { normalizeLoopGuardTenant } = await import("../loop-guard");

    const view = normalizeLoopGuardTenant({
      reply: { enabled: "true", window: "128", max_distinct: Number.NaN },
      tool: { enabled: 1, repeats: 7.9 },
      key_overrides: "2",
      persistent: false,
      updated_at: 5,
      defaults: { reply_window: "x" },
      bounds: {},
    });

    expect(view).toMatchObject({
      // Only an explicit true turns a check on.
      reply: { enabled: false, window: 0, max_distinct: 0 },
      tool: { enabled: false, repeats: 7 },
      key_overrides: 0,
      persistent: false,
      updated_at: "",
      defaults: { reply_window: 0, reply_max_distinct: 0, tool_repeats: 0 },
    });
  });
});

describe("normalizeLoopGuardKey", () => {
  test("keeps follow-the-tenant apart from off, and reads the effective result", async () => {
    const { normalizeLoopGuardKey } = await import("../loop-guard");

    expect(normalizeLoopGuardKey(keyPayload)).toEqual({
      key_id: "key-1",
      reply: { enabled: null, window: 0, max_distinct: 0 },
      tool: { enabled: false, repeats: 5 },
      tenant: {
        reply: { enabled: true, window: 128, max_distinct: 0 },
        tool: { enabled: true, repeats: 0 },
      },
      effective: {
        reply: { enabled: true, source: "tenant", window: 128, max_distinct: 24 },
        // A check that is off carries no source or thresholds.
        tool: { enabled: false, source: "", repeats: 0 },
      },
      ...info,
    });
  });

  test("reads who switched a check on, and ignores a source it does not know", async () => {
    const { normalizeLoopGuardKey } = await import("../loop-guard");

    const view = normalizeLoopGuardKey({
      ...keyPayload,
      effective: {
        reply: { enabled: true, source: "api_key", window: 64, max_distinct: 16 },
        tool: { enabled: true, source: "platform", repeats: 4 },
      },
    });

    expect(view?.effective.reply.source).toBe("api_key");
    expect(view?.effective.tool).toEqual({ enabled: true, source: "", repeats: 4 });
  });

  test.each<[string, unknown]>([
    ["nothing", undefined],
    ["a tenant response", tenantPayload],
    ["no tenant", { ...keyPayload, tenant: undefined }],
    ["no effective part", { ...keyPayload, effective: "on" }],
    ["no defaults", { ...keyPayload, defaults: null }],
  ])("is not a key's loop protection when it is %s", async (_name, raw) => {
    const { normalizeLoopGuardKey } = await import("../loop-guard");

    expect(normalizeLoopGuardKey(raw)).toBeNull();
  });
});

describe("loopGuardApi", () => {
  beforeEach(() => {
    getMock.mockReset();
    putMock.mockReset();
  });

  test("reads the tenant's settings and passes the abort signal on", async () => {
    const { loopGuardApi } = await import("../loop-guard");
    getMock.mockResolvedValue(tenantPayload);
    const controller = new AbortController();

    const view = await loopGuardApi.getTenant({ signal: controller.signal });

    expect(getMock).toHaveBeenCalledWith("/loop-guard", { signal: controller.signal });
    expect(view?.key_overrides).toBe(2);
  });

  test("answers null for a 200 that is not loop protection, and lets an error through", async () => {
    const { loopGuardApi } = await import("../loop-guard");
    getMock.mockResolvedValueOnce("<html>not the API</html>");
    await expect(loopGuardApi.getTenant()).resolves.toBeNull();

    // A backend without the feature answers 404 (the client throws it).
    getMock.mockRejectedValueOnce(new Error("Not Found"));
    await expect(loopGuardApi.getTenant()).rejects.toThrow("Not Found");
  });

  test("writes the sections it is given and returns the saved view", async () => {
    const { loopGuardApi } = await import("../loop-guard");
    putMock.mockResolvedValue({ ...tenantPayload, tool: { enabled: true, repeats: 6 } });

    const view = await loopGuardApi.putTenant({
      tool: { enabled: true, repeats: 6 },
    });

    expect(putMock).toHaveBeenCalledWith("/loop-guard", { tool: { enabled: true, repeats: 6 } });
    expect(view.tool).toEqual({ enabled: true, repeats: 6 });
  });

  test("addresses a key by its id, escaped", async () => {
    const { loopGuardApi } = await import("../loop-guard");
    getMock.mockResolvedValue(keyPayload);
    putMock.mockResolvedValue(keyPayload);

    await loopGuardApi.getKey("team/a b?");
    await loopGuardApi.putKey("team/a b?", { reply: { enabled: null } });

    expect(getMock).toHaveBeenCalledWith("/loop-guard/keys/team%2Fa%20b%3F", {
      signal: undefined,
    });
    expect(putMock).toHaveBeenCalledWith("/loop-guard/keys/team%2Fa%20b%3F", {
      reply: { enabled: null },
    });
  });

  test("does not call a write saved when the response is not the settings", async () => {
    const { loopGuardApi } = await import("../loop-guard");
    putMock.mockResolvedValue({ ok: true });

    await expect(loopGuardApi.putTenant({ reply: { enabled: true } })).rejects.toThrow(
      "Unexpected response",
    );
    await expect(loopGuardApi.putKey("key-1", { reply: { enabled: true } })).rejects.toThrow(
      "Unexpected response",
    );
  });
});
