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
  test("requests coding usage with kimi headers and maps the response", async () => {
    mocks.downloadText.mockResolvedValueOnce(
      JSON.stringify({
        access_token: "redacted",
        device_id: "device-123",
      }),
    );
    mocks.request.mockResolvedValueOnce({
      statusCode: 200,
      header: {},
      bodyText: "",
      body: {
        usages: [
          {
            scope: "FEATURE_CODING",
            detail: {
              limit: "100",
              used: "3",
              remaining: "97",
              resetTime: "2026-04-27T02:54:38.657133Z",
            },
            limits: [
              {
                window: {
                  duration: 300,
                  timeUnit: "TIME_UNIT_MINUTE",
                },
                detail: {
                  limit: "100",
                  used: "15",
                  remaining: "85",
                  resetTime: "2026-04-20T07:54:38.657133Z",
                },
              },
            ],
          },
        ],
      },
    });

    const result = await fetchQuota("kimi", {
      name: "kimi.json",
      provider: "kimi",
      auth_index: "9",
    } as any);

    expect(mocks.downloadText).toHaveBeenCalledWith("kimi.json");
    expect(mocks.request).toHaveBeenCalledWith(
      expect.objectContaining({
        authIndex: "9",
        method: "POST",
        url: "https://www.kimi.com/apiv2/kimi.gateway.billing.v1.BillingService/GetUsages",
        data: JSON.stringify({ scope: ["FEATURE_CODING"] }),
        header: expect.objectContaining({
          Authorization: "Bearer $TOKEN$",
          "Content-Type": "application/json",
          "X-Msh-Device-Id": "device-123",
          "X-Msh-Platform": "web",
          "X-Msh-Version": "1.0.0",
        }),
      }),
    );
    expect(result.items).toEqual([
      {
        label: "m_quota.code_5h",
        percent: 85,
        resetAtMs: Date.parse("2026-04-20T07:54:38.657133Z"),
      },
      {
        label: "m_quota.code_weekly",
        percent: 97,
        resetAtMs: Date.parse("2026-04-27T02:54:38.657133Z"),
      },
    ]);
  });
});
