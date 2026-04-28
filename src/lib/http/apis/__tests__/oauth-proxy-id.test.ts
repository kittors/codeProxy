import { beforeEach, describe, expect, test, vi } from "vitest";

const getMock = vi.fn();
const postMock = vi.fn();
const postFormMock = vi.fn();

vi.mock("@/lib/http/client", () => ({
  apiClient: {
    get: getMock,
    post: postMock,
    postForm: postFormMock,
  },
}));

describe("OAuth proxy id serialization", () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
    postFormMock.mockReset();
  });

  test("passes proxy_id when starting a web OAuth authorization", async () => {
    const { oauthApi } = await import("@/lib/http/apis/oauth");
    getMock.mockResolvedValue({ url: "https://auth.example", state: "state-1" });

    await oauthApi.startAuth("codex", { proxyId: "hk" });

    expect(getMock).toHaveBeenCalledWith("/codex-auth-url", {
      params: { is_webui: true, proxy_id: "hk" },
    });
  });

  test("passes proxy_id when submitting an OAuth callback", async () => {
    const { oauthApi } = await import("@/lib/http/apis/oauth");
    postMock.mockResolvedValue({ status: "ok" });

    await oauthApi.submitCallback("codex", "https://callback.example", { proxyId: "hk" });

    expect(postMock).toHaveBeenCalledWith("/oauth-callback", {
      provider: "codex",
      redirect_url: "https://callback.example",
      proxy_id: "hk",
    });
  });

  test("passes proxy_id when importing iFlow Cookie auth", async () => {
    const { oauthApi } = await import("@/lib/http/apis/oauth");
    postMock.mockResolvedValue({ status: "ok" });

    await oauthApi.iflowCookieAuth("cookie=value", { proxyId: "hk" });

    expect(postMock).toHaveBeenCalledWith("/iflow-auth-url", {
      cookie: "cookie=value",
      proxy_id: "hk",
    });
  });

  test("passes proxy_id when importing Vertex credentials", async () => {
    const { vertexApi } = await import("@/lib/http/apis/vertex");
    const file = new File(["{}"], "vertex.json", { type: "application/json" });
    postFormMock.mockResolvedValue({ status: "ok" });

    await vertexApi.importCredential(file, "us-central1", { proxyId: "hk" });

    const formData = postFormMock.mock.calls[0]?.[1] as FormData;
    expect(postFormMock).toHaveBeenCalledWith("/vertex/import", expect.any(FormData));
    expect(formData.get("location")).toBe("us-central1");
    expect(formData.get("proxy_id")).toBe("hk");
  });
});
