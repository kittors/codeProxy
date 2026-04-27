import { beforeEach, describe, expect, test, vi } from "vitest";

const getMock = vi.fn();
const putMock = vi.fn();
const postMock = vi.fn();

vi.mock("@/lib/http/client", () => ({
  apiClient: {
    get: getMock,
    put: putMock,
    post: postMock,
  },
}));

describe("proxiesApi", () => {
  beforeEach(() => {
    getMock.mockReset();
    putMock.mockReset();
    postMock.mockReset();
  });

  test("lists proxy pool entries from the management API", async () => {
    const { proxiesApi } = await import("@/lib/http/apis/proxies");
    getMock.mockResolvedValue({
      items: [{ id: "hk", name: "HK", url: "socks5://127.0.0.1:1080", enabled: true }],
    });

    const result = await proxiesApi.list();

    expect(getMock).toHaveBeenCalledWith("/proxy-pool");
    expect(result).toEqual([
      { id: "hk", name: "HK", url: "socks5://127.0.0.1:1080", enabled: true },
    ]);
  });

  test("saves proxy pool entries with normalized payload shape", async () => {
    const { proxiesApi } = await import("@/lib/http/apis/proxies");
    putMock.mockResolvedValue({ status: "ok" });

    await proxiesApi.saveAll([
      { id: "hk", name: "HK", url: "http://127.0.0.1:7890", enabled: true },
    ]);

    expect(putMock).toHaveBeenCalledWith("/proxy-pool", {
      items: [{ id: "hk", name: "HK", url: "http://127.0.0.1:7890", enabled: true }],
    });
  });

  test("checks a proxy entry with a short timeout", async () => {
    const { proxiesApi } = await import("@/lib/http/apis/proxies");
    postMock.mockResolvedValue({ ok: true, statusCode: 204, latencyMs: 24 });

    await proxiesApi.check({ id: "hk" });

    expect(postMock).toHaveBeenCalledWith(
      "/proxy-pool/check",
      { id: "hk" },
      expect.objectContaining({ timeoutMs: 12000 }),
    );
  });
});

