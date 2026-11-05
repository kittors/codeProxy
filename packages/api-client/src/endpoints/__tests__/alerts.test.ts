import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  post: vi.fn(),
}));

vi.mock("../../client/client", () => ({
  apiClient: { get: mocks.get, put: mocks.put, post: mocks.post, patch: vi.fn(), delete: vi.fn() },
}));

describe("alertsApi", () => {
  beforeEach(() => {
    mocks.get.mockReset();
    mocks.put.mockReset();
    mocks.post.mockReset();
  });

  test("reads the settings and the recent events from the alerts routes", async () => {
    const { alertsApi } = await import("../alerts");
    mocks.get.mockResolvedValue({});

    await alertsApi.getSettings();
    expect(mocks.get).toHaveBeenLastCalledWith("/alerts/settings");

    const controller = new AbortController();
    await alertsApi.getSettings({ signal: controller.signal });
    expect(mocks.get).toHaveBeenLastCalledWith("/alerts/settings", { signal: controller.signal });

    await alertsApi.listEvents();
    expect(mocks.get).toHaveBeenLastCalledWith("/alerts/events", { params: { limit: 50 } });
    await alertsApi.listEvents(20, { signal: controller.signal });
    expect(mocks.get).toHaveBeenLastCalledWith("/alerts/events", {
      params: { limit: 20 },
      signal: controller.signal,
    });
  });

  test("sends the update body as is and posts a test with or without a draft", async () => {
    const { alertsApi } = await import("../alerts");
    mocks.put.mockResolvedValue({});
    mocks.post.mockResolvedValue({ results: [] });

    const body = { enabled: true, rules: { spending: { enabled: true, threshold_percent: 80 } } };
    await alertsApi.updateSettings(body);
    expect(mocks.put).toHaveBeenCalledWith("/alerts/settings", body);

    await alertsApi.sendTest();
    expect(mocks.post).toHaveBeenLastCalledWith("/alerts/test", {});

    const channel = {
      id: "c1",
      kind: "webhook" as const,
      name: "ops",
      enabled: true,
      url: "https://x/****abcd",
    };
    await alertsApi.sendTest({ channel });
    expect(mocks.post).toHaveBeenLastCalledWith("/alerts/test", { channel });
  });
});

describe("poolCapacityApi", () => {
  beforeEach(() => {
    mocks.get.mockReset();
  });

  test("reads the pool capacity from the AI accounts route", async () => {
    const { poolCapacityApi } = await import("../poolCapacity");
    mocks.get.mockResolvedValue({ generated_at: "", pools: [] });
    await poolCapacityApi.get();
    expect(mocks.get).toHaveBeenLastCalledWith("/ai-accounts/pool-capacity");
    const controller = new AbortController();
    await poolCapacityApi.get({ signal: controller.signal });
    expect(mocks.get).toHaveBeenLastCalledWith("/ai-accounts/pool-capacity", {
      signal: controller.signal,
    });
  });
});
