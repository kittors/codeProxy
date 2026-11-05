import { describe, expect, test, vi } from "vitest";
import { portalClient } from "../../client/portal-client";
import { portalPrivacyMaskingApi, type PrivacyMaskPolicy } from "../privacy-masking";

const POLICY: PrivacyMaskPolicy = {
  secrets: true,
  personal: false,
  kinds: {},
  words: ["Nightjar"],
  words_any_case: false,
  words_whole: false,
  rules: [],
  allow: [],
  actions: {},
};

describe("portalPrivacyMaskingApi", () => {
  test("keeps the signed-in user's own settings under /v0/portal, writing only the policy", async () => {
    const get = vi.spyOn(portalClient, "get").mockResolvedValue({});
    const put = vi.spyOn(portalClient, "put").mockResolvedValue({});
    const remove = vi.spyOn(portalClient, "delete").mockResolvedValue({});
    const post = vi.spyOn(portalClient, "post").mockResolvedValue({});

    await portalPrivacyMaskingApi.getSettings();
    await portalPrivacyMaskingApi.putSettings(POLICY);
    await portalPrivacyMaskingApi.resetSettings();
    await portalPrivacyMaskingApi.preview("sk-proj-abc", POLICY);

    expect(get).toHaveBeenCalledWith("/v0/portal/privacy-masking/settings");
    // 强制开启的类目、门户用户能否自设都是管理员的，门户只发自己的设置
    expect(put).toHaveBeenCalledWith("/v0/portal/privacy-masking/settings", { policy: POLICY });
    expect(remove).toHaveBeenCalledWith("/v0/portal/privacy-masking/settings");
    expect(post).toHaveBeenCalledWith("/v0/portal/privacy-masking/preview", {
      text: "sk-proj-abc",
      policy: POLICY,
    });
  });

  test("reads the user's records with the console's filters and cursor", async () => {
    const get = vi.spyOn(portalClient, "get").mockResolvedValue({ items: [] });
    const remove = vi.spyOn(portalClient, "delete").mockResolvedValue({ deleted: 3 });

    await portalPrivacyMaskingApi.getSummary({ days: 30 });
    await portalPrivacyMaskingApi.listRecords(
      { days: 7, facet: "secret", client: "codex", kind: "" },
      { before: "a1", limit: 40 },
    );
    await portalPrivacyMaskingApi.getRecord("a/1");
    await portalPrivacyMaskingApi.clearRecords();

    expect(get.mock.calls.map(([path]) => path)).toEqual([
      "/v0/portal/privacy-masking/summary?days=30",
      "/v0/portal/privacy-masking/records?days=7&facet=secret&client=codex&before=a1&limit=40",
      "/v0/portal/privacy-masking/records/a%2F1",
    ]);
    expect(remove).toHaveBeenCalledWith("/v0/portal/privacy-masking/records");
  });
});
