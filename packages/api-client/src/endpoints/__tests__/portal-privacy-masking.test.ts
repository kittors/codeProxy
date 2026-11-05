import { describe, expect, test, vi } from "vitest";
import { portalClient } from "../../client/portal-client";
import { portalPrivacyMaskingApi } from "../privacy-masking";

describe("portalPrivacyMaskingApi", () => {
  test("reads the signed-in user's records and the rules in effect under /v0/portal", async () => {
    const get = vi.spyOn(portalClient, "get").mockResolvedValue({ items: [] });

    await portalPrivacyMaskingApi.getSummary({ days: 30 });
    await portalPrivacyMaskingApi.listRecords(
      { days: 7, facet: "secret", client: "codex", kind: "" },
      { before: "a1", limit: 40 },
    );
    await portalPrivacyMaskingApi.getRecord("a/1");
    await portalPrivacyMaskingApi.getSettings();

    expect(get.mock.calls.map(([path]) => path)).toEqual([
      "/v0/portal/privacy-masking/summary?days=30",
      "/v0/portal/privacy-masking/records?days=7&facet=secret&client=codex&before=a1&limit=40",
      "/v0/portal/privacy-masking/records/a%2F1",
      "/v0/portal/privacy-masking/settings",
    ]);
  });

  test("tries a text out under the rules in effect, sending no policy of its own", async () => {
    const post = vi
      .spyOn(portalClient, "post")
      .mockResolvedValue({ text: "", values: [], blocked: false });

    await portalPrivacyMaskingApi.preview("sk-proj-abc");

    expect(post).toHaveBeenCalledWith("/v0/portal/privacy-masking/preview", {
      text: "sk-proj-abc",
      policy: undefined,
    });
    // 门户只读：后端的写设置、清空记录接口不在门户的接口里
    expect(Object.keys(portalPrivacyMaskingApi).sort()).toEqual([
      "getRecord",
      "getSettings",
      "getSummary",
      "listRecords",
      "preview",
    ]);
  });
});
