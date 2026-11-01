import { beforeEach, describe, expect, test, vi } from "vitest";

const postMock = vi.fn();

vi.mock("../../client/client", () => ({
  apiClient: { get: vi.fn(), put: vi.fn(), patch: vi.fn(), post: postMock, delete: vi.fn() },
}));

describe("payload rules dry-run", () => {
  beforeEach(() => {
    postMock.mockReset();
  });

  test("posts the request as is", async () => {
    const { payloadRulesApi } = await import("../payload-rules");
    postMock.mockResolvedValue({ body: "{}", models: [], rules: [], changes: [] });
    const request = { model: "gpt-5", protocol: "codex", body: "{}", rules: { override: [] } };
    await payloadRulesApi.dryRun(request);
    expect(postMock).toHaveBeenCalledWith("/payload-rules/dry-run", request);
  });

  test("offers the dry-run only when GET /config says true", async () => {
    const { readConfigCapabilities } = await import("../payload-rules");
    expect(readConfigCapabilities({ capabilities: { "payload-rules-dry-run": true } })).toEqual({
      payloadRulesDryRun: true,
      alerts: false,
      poolCapacity: false,
    });
    for (const config of [
      { capabilities: { "payload-rules-dry-run": "true" } },
      { capabilities: [] },
      { capabilities: null },
      {},
      null,
      undefined,
    ]) {
      expect(readConfigCapabilities(config as Record<string, unknown> | null | undefined)).toEqual({
        payloadRulesDryRun: false,
        alerts: false,
        poolCapacity: false,
      });
    }
  });

  test("reads the alerts and pool-capacity declarations by their kebab-case keys", async () => {
    const { readConfigCapabilities } = await import("../payload-rules");
    expect(
      readConfigCapabilities({ capabilities: { alerts: true, "pool-capacity": true } }),
    ).toEqual({ payloadRulesDryRun: false, alerts: true, poolCapacity: true });
    // Only an explicit true unlocks a page: a truthy string or a camelCase key is not a declaration.
    expect(
      readConfigCapabilities({ capabilities: { alerts: "yes", poolCapacity: true, "pool-capacity": 1 } }),
    ).toEqual({ payloadRulesDryRun: false, alerts: false, poolCapacity: false });
  });
});
