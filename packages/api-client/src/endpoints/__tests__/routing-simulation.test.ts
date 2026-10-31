import { beforeEach, describe, expect, test, vi } from "vitest";

const getMock = vi.fn();

vi.mock("../../client/client", () => ({
  apiClient: { get: getMock, put: vi.fn(), patch: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

describe("routing simulation", () => {
  beforeEach(() => {
    getMock.mockReset();
    getMock.mockResolvedValue({ stages: [] });
  });

  test("names the key by id and sends only what was filled in", async () => {
    const { routingSimulationApi } = await import("../routing-simulation");
    await routingSimulationApi.run({ apiKeyId: "key-1", model: "gpt-5(high)" });
    expect(getMock).toHaveBeenLastCalledWith(
      "/routing-simulation?api-key-id=key-1&model=gpt-5%28high%29",
    );

    await routingSimulationApi.run({
      apiKeyId: "key 2",
      model: "claude-sonnet-4-5",
      routePath: " /team ",
      endpoint: "messages",
    });
    expect(getMock).toHaveBeenLastCalledWith(
      "/routing-simulation?api-key-id=key+2&model=claude-sonnet-4-5&route-path=%2Fteam&endpoint=messages",
    );

    await routingSimulationApi.run({ apiKeyId: "key-1", model: "m", routePath: "  " });
    expect(getMock).toHaveBeenLastCalledWith("/routing-simulation?api-key-id=key-1&model=m");
  });
});
