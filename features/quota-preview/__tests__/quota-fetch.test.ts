import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
}));

vi.mock("@code-proxy/api-client", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@code-proxy/api-client")>();
  return {
    ...mod,
    apiCallApi: {
      ...mod.apiCallApi,
      request: mocks.request,
    },
  };
});

import { consumeCodexResetCredit, resolveQuotaProvider } from "@features/quota-preview/quota-fetch";
import type { AuthFileItem } from "@code-proxy/api-client";

beforeEach(() => {
  mocks.request.mockReset();
});

const encodeBase64UrlJson = (value: unknown): string =>
  Buffer.from(JSON.stringify(value), "utf8").toString("base64url");

const buildSyntheticCodexIdToken = (accountId: string): string =>
  [
    encodeBase64UrlJson({ alg: "none", typ: "JWT", cpa_synthetic: true }),
    encodeBase64UrlJson({
      iat: 1779509287,
      exp: 1780333688,
      email: "alpha@example.test",
      "https://api.openai.com/auth": {
        chatgpt_account_id: accountId,
        chatgpt_plan_type: "plus",
        chatgpt_user_id: "user-111",
        user_id: "user-111",
      },
    }),
    "synthetic",
  ].join(".");

describe("resolveQuotaProvider", () => {
  test("supports kimi auth files", () => {
    expect(resolveQuotaProvider({ name: "kimi.json", provider: "kimi" } as any)).toBe("kimi");
  });

  test("supports xAI and Grok auth files", () => {
    expect(resolveQuotaProvider({ name: "xai.json", provider: "xai" } as AuthFileItem)).toBe("xai");
    expect(resolveQuotaProvider({ name: "grok.json", provider: "grok" } as AuthFileItem)).toBe(
      "xai",
    );
    expect(resolveQuotaProvider({ name: "x-ai.json", type: "x-ai" } as AuthFileItem)).toBe("xai");
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

describe("consumeCodexResetCredit", () => {
  test("posts a redeem request id to the ChatGPT reset-credit consume endpoint", async () => {
    // Details query returns empty credits
    mocks.request.mockResolvedValueOnce({
      statusCode: 200,
      header: {},
      bodyText: "",
      body: { credits: [] },
    });
    // Consume returns success
    mocks.request.mockResolvedValueOnce({
      statusCode: 200,
      header: {},
      bodyText: "",
      body: { code: "success", windows_reset: 1 },
    });

    await consumeCodexResetCredit({
      name: "codex-alpha@example.test-plus.json",
      type: "codex",
      provider: "codex",
      auth_index: "auth-codex-alpha",
      id_token: buildSyntheticCodexIdToken("acct-111"),
    } as any);

    expect(mocks.request).toHaveBeenCalledTimes(2);
    const payload = mocks.request.mock.calls[1]?.[0];
    expect(payload).toEqual(
      expect.objectContaining({
        authIndex: "auth-codex-alpha",
        method: "POST",
        url: "https://chatgpt.com/backend-api/wham/rate-limit-reset-credits/consume",
        header: expect.objectContaining({
          Authorization: "Bearer $TOKEN$",
          "Chatgpt-Account-Id": "acct-111",
          "Content-Type": "application/json",
        }),
      }),
    );
    expect(JSON.parse(payload.data)).toEqual({
      redeem_request_id: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      ),
    });
  });
  test("consumes specific credit_id in FIFO order when credits are available", async () => {
    mocks.request.mockResolvedValueOnce({
      statusCode: 200,
      header: {},
      bodyText: "",
      body: {
        credits: [
          { id: "credit-later", expires_at: "2026-08-10T00:00:00Z" },
          { id: "credit-earlier", expires_at: "2026-08-01T00:00:00Z" },
        ],
      },
    });
    mocks.request.mockResolvedValueOnce({
      statusCode: 200,
      header: {},
      bodyText: "",
      body: { code: "success", windows_reset: 1 },
    });

    await consumeCodexResetCredit({
      name: "codex-alpha@example.test-plus.json",
      type: "codex",
      provider: "codex",
      auth_index: "auth-codex-alpha",
    } as any);

    expect(mocks.request).toHaveBeenCalledTimes(2);
    const consumePayload = mocks.request.mock.calls[1]?.[0];
    expect(JSON.parse(consumePayload.data)).toEqual({
      redeem_request_id: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      ),
      credit_id: "credit-earlier",
    });
  });
});
