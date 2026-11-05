import { describe, expect, test, vi } from "vitest";
import { portalClient } from "../../client/portal-client";
import { privacyMaskingPortalApi } from "../privacy-masking-portal";

describe("privacyMaskingPortalApi", () => {
  test("reads the signed-in user's records and the tenant's rules under /v0/portal", async () => {
    const get = vi.spyOn(portalClient, "get").mockResolvedValue({ items: [] });

    await privacyMaskingPortalApi.getSummary({ days: 30 });
    await privacyMaskingPortalApi.listRecords(
      { days: 7, facet: "secret", client: "codex", kind: "" },
      { before: "a1", limit: 40 },
    );
    await privacyMaskingPortalApi.getRecord("a/1");
    await privacyMaskingPortalApi.getSettings();

    expect(get.mock.calls.map(([path]) => path)).toEqual([
      "/v0/portal/privacy-masking/summary?days=30",
      "/v0/portal/privacy-masking/records?days=7&facet=secret&client=codex&before=a1&limit=40",
      "/v0/portal/privacy-masking/records/a%2F1",
      "/v0/portal/privacy-masking/settings",
    ]);
  });

  test("tries a text out with nothing but the text, and has no way to write", async () => {
    const post = vi
      .spyOn(portalClient, "post")
      .mockResolvedValue({ text: "", values: [], blocked: false });

    await privacyMaskingPortalApi.preview("sk-proj-abc");

    expect(post).toHaveBeenCalledWith("/v0/portal/privacy-masking/preview", {
      text: "sk-proj-abc",
    });
    // 门户只读：后端也没有门户的写接口了，这里只有读和试一试
    expect(Object.keys(privacyMaskingPortalApi).sort()).toEqual([
      "getRecord",
      "getSettings",
      "getSummary",
      "listRecords",
      "preview",
    ]);
  });
});
