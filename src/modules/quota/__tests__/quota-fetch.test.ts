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

  test("supports Anthropic OAuth auth files as Claude quota files", () => {
    expect(
      resolveQuotaProvider({
        name: "claude-oauth.json",
        provider: "anthropic",
        type: "claude",
        account_type: "oauth",
      } as any),
    ).toBe("claude");
  });

  test("does not treat Claude API key auth files as quota files", () => {
    expect(
      resolveQuotaProvider({
        name: "claude-api-key.json",
        provider: "claude",
        account_type: "api-key",
      } as any),
    ).toBeNull();
  });
});

describe("fetchQuota for claude", () => {
  test("requests Anthropic OAuth usage endpoint and maps remaining percentages", async () => {
    mocks.request.mockResolvedValueOnce({
      statusCode: 200,
      header: {},
      bodyText: "",
      body: {
        five_hour: { utilization: 12.5, resets_at: "2026-05-01T05:00:00Z" },
        seven_day: { utilization: 34, resets_at: "2026-05-08T05:00:00Z" },
        seven_day_sonnet: { utilization: 56, resets_at: "2026-05-08T05:00:00Z" },
      },
    });

    const result = await fetchQuota("claude", {
      name: "claude-oauth.json",
      provider: "anthropic",
      type: "claude",
      account_type: "oauth",
      auth_index: "claude-1",
    } as any);

    expect(mocks.request).toHaveBeenCalledWith(
      expect.objectContaining({
        authIndex: "claude-1",
        method: "GET",
        url: "https://api.anthropic.com/api/oauth/usage",
        header: expect.objectContaining({
          Accept: "application/json, text/plain, */*",
          Authorization: "Bearer $TOKEN$",
          "User-Agent": "claude-code/2.1.7",
          "anthropic-beta": "oauth-2025-04-20",
        }),
      }),
    );
    expect(result.items).toEqual([
      {
        key: "five_hour",
        label: "claude_quota.five_hour",
        percent: 87.5,
        resetAtMs: Date.parse("2026-05-01T05:00:00Z"),
      },
      {
        key: "seven_day",
        label: "claude_quota.seven_day",
        percent: 66,
        resetAtMs: Date.parse("2026-05-08T05:00:00Z"),
      },
      {
        key: "seven_day_sonnet",
        label: "claude_quota.seven_day_sonnet",
        percent: 44,
        resetAtMs: Date.parse("2026-05-08T05:00:00Z"),
      },
    ]);
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
        key: "code_5h",
        label: "m_quota.code_5h",
        percent: 100,
        resetAtMs: Date.parse("2026-04-20T11:24:38.060611Z"),
        windowSeconds: 18000,
      },
      {
        key: "code_week",
        label: "m_quota.code_weekly",
        percent: 0,
        resetAtMs: Date.parse("2026-04-22T01:24:38.060611Z"),
        windowSeconds: 604800,
      },
    ]);
  });
});
