import { describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  downloadText: vi.fn(),
}));

vi.mock("@/lib/http/apis", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/http/apis")>();
  return {
    ...mod,
    apiCallApi: {
      ...mod.apiCallApi,
      request: mocks.request,
    },
    authFilesApi: {
      ...mod.authFilesApi,
      downloadText: mocks.downloadText,
    },
  };
});

import { fetchQuota, resolveQuotaProvider } from "@/modules/quota/quota-fetch";

describe("resolveQuotaProvider", () => {
  test("supports kimi auth files", () => {
    expect(resolveQuotaProvider({ name: "kimi.json", provider: "kimi" } as any)).toBe("kimi");
  });
});

describe("fetchQuota for kimi", () => {
  test("requests kimi code usages endpoint and maps the response", async () => {
    mocks.request.mockResolvedValueOnce({
      statusCode: 200,
      header: {},
      bodyText: "",
      body: {
        usage: {
          limit: "100",
          used: "100",
          resetTime: "2026-04-22T01:24:38.060611Z",
        },
        limits: [
          {
            window: {
              duration: 300,
              timeUnit: "TIME_UNIT_MINUTE",
            },
            detail: {
              limit: "100",
              remaining: "100",
              resetTime: "2026-04-20T11:24:38.060611Z",
            },
          },
        ],
      },
    });

    const result = await fetchQuota("kimi", {
      name: "kimi.json",
      provider: "kimi",
      auth_index: "9",
    } as any);

    expect(mocks.downloadText).not.toHaveBeenCalled();
    expect(mocks.request).toHaveBeenCalledWith(
      expect.objectContaining({
        authIndex: "9",
        method: "GET",
        url: "https://api.kimi.com/coding/v1/usages",
        header: expect.objectContaining({
          Authorization: "Bearer $TOKEN$",
        }),
      }),
    );
    expect(result.items).toEqual([
      {
        label: "m_quota.code_5h",
        percent: 100,
        resetAtMs: Date.parse("2026-04-20T11:24:38.060611Z"),
      },
      {
        label: "m_quota.code_weekly",
        percent: 0,
        resetAtMs: Date.parse("2026-04-22T01:24:38.060611Z"),
      },
    ]);
  });
});
