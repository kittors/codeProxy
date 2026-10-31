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
      });
    }
  });
});
