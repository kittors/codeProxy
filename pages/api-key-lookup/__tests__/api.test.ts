import { afterEach, describe, expect, test, vi } from "vitest";
import { portalClient } from "@code-proxy/api-client";
import { fetchPublicChartData, normalizePublicModelItem } from "../api";

describe("normalizePublicModelItem", () => {
  test("maps description and pricing fields from /v1/models payload", () => {
    const model = normalizePublicModelItem({
      id: "gpt-5.4",
      owned_by: "openai",
      description: "OpenAI flagship",
      input_modalities: ["text", "image"],
      output_modalities: ["text"],
      supports_vision: true,
      pricing: {
        mode: "token",
        input_price_per_million: 2.5,
        output_price_per_million: 10,
        cached_price_per_million: 0.25,
        cache_read_price_per_million: 0.25,
        cache_write_price_per_million: 1.25,
      },
    });

    expect(model).toEqual({
      id: "gpt-5.4",
      description: "OpenAI flagship",
      ownedBy: "openai",
      pricing: {
        mode: "token",
        inputPricePerMillion: 2.5,
        outputPricePerMillion: 10,
        cachedPricePerMillion: 0.25,
        cacheReadPricePerMillion: 0.25,
        cacheWritePricePerMillion: 1.25,
        pricePerCall: 0,
      },
      inputModalities: ["text", "image"],
      outputModalities: ["text"],
      supportsVision: true,
    });
  });

  test("falls back to empty pricing when payload only has id", () => {
    const model = normalizePublicModelItem({ id: "gpt-5.4" });
    expect(model?.id).toBe("gpt-5.4");
    expect(model?.description).toBe("");
    expect(model?.pricing.inputPricePerMillion).toBe(0);
  });
});

describe("public usage subject", () => {
  afterEach(() => {
    portalClient.clearSession();
    vi.unstubAllGlobals();
  });

  test("uses the portal bearer token and omits api_key for account usage", async () => {
    portalClient.setSession({
      apiBase: "http://relay.test",
      accessToken: "cpt_account_token",
      refreshToken: "cpr_refresh",
      remember: false,
      expiresAt: Date.now() + 60_000,
    });
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            daily_series: [],
            heatmap_series: [],
            model_distribution: [],
            stats: { total: 0, success_rate: 0, total_tokens: 0, total_cost: 0 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchPublicChartData({
      apiKey: "sk-stale-secret-must-not-be-used",
      portalAccount: true,
      days: 7,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://relay.test/v0/management/public/usage/chart-data");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer cpt_account_token");
    expect(JSON.parse(String(init.body))).toEqual({ days: 7 });
  });
});
