import { beforeEach, describe, expect, test, vi } from "vitest";

const getMock = vi.fn();
const putMock = vi.fn();
const patchMock = vi.fn();
const postMock = vi.fn();

vi.mock("../../client/client", () => ({
  apiClient: {
    get: getMock,
    put: putMock,
    patch: patchMock,
    post: postMock,
  },
}));

describe("proxiesApi", () => {
  beforeEach(() => {
    getMock.mockReset();
    putMock.mockReset();
    patchMock.mockReset();
    postMock.mockReset();
  });

  test("lists proxy pool entries from the management API", async () => {
    const { proxiesApi } = await import("@code-proxy/api-client/endpoints/proxies");
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
    const { proxiesApi } = await import("@code-proxy/api-client/endpoints/proxies");
    putMock.mockResolvedValue({ status: "ok" });

    await proxiesApi.saveAll([
      { id: "hk", name: "HK", url: "http://127.0.0.1:7890", enabled: true },
    ]);

    expect(putMock).toHaveBeenCalledWith("/proxy-pool", {
      items: [{ id: "hk", name: "HK", url: "http://127.0.0.1:7890", enabled: true }],
    });
  });

  test("checks a proxy entry with a short timeout and normalizes backend field names", async () => {
    const { proxiesApi } = await import("@code-proxy/api-client/endpoints/proxies");
    postMock.mockResolvedValue({ ok: true, status_code: 204, latency_ms: 24 });

    const result = await proxiesApi.check({ id: "hk" });

    expect(postMock).toHaveBeenCalledWith(
      "/proxy-pool/check",
      { id: "hk" },
      expect.objectContaining({ timeoutMs: 12000 }),
    );
    expect(result).toEqual({ ok: true, statusCode: 204, latencyMs: 24 });
  });

  test("updates one proxy entry through the single-item patch API", async () => {
    const { proxiesApi } = await import("@code-proxy/api-client/endpoints/proxies");
    patchMock.mockResolvedValue({ status: "ok" });

    await proxiesApi.update("hk", {
      name: "Updated HK",
      url: "http://127.0.0.1:7891",
      enabled: false,
      description: "rotated",
    });

    expect(patchMock).toHaveBeenCalledWith("/proxy-pool/hk", {
      name: "Updated HK",
      url: "http://127.0.0.1:7891",
      enabled: false,
      description: "rotated",
    });
  });

  test("degrades to own entries only when the backend does not declare sharing", async () => {
    const { proxiesApi } = await import("@code-proxy/api-client/endpoints/proxies");
    // Old backend: no `sharing` capability. Stray sharing fields must not leak into the UI.
    getMock.mockResolvedValue({
      items: [
        {
          id: "hk",
          name: "HK",
          url: "socks5://127.0.0.1:1080",
          enabled: true,
          sharing: { all: true, tenant_ids: [] },
        },
      ],
      shared_items: [{ id: "sg", name: "SG", enabled: true, masked_url: "socks5://1.2.3.4:1080" }],
    });

    const listing = await proxiesApi.listWithSharing();

    expect(listing).toEqual({
      items: [{ id: "hk", name: "HK", url: "socks5://127.0.0.1:1080", enabled: true }],
      sharedItems: [],
      sharing: { supported: false, manageable: false },
    });
    expect(await proxiesApi.listSelectable()).toEqual(listing.items);
  });

  test("reads sharing and overrides on system tenant entries", async () => {
    const { proxiesApi } = await import("@code-proxy/api-client/endpoints/proxies");
    getMock.mockResolvedValue({
      items: [
        {
          id: "hk",
          name: "HK",
          url: "socks5://u:p@127.0.0.1:1080",
          masked_url: "socks5://127.0.0.1:1080",
          enabled: true,
          sharing: { all: false, tenant_ids: ["t1", "t2"] },
          overridden_by: [{ id: "t2", name: "Potato" }],
        },
        { id: "us", name: "US", url: "http://127.0.0.1:7890", enabled: true },
      ],
      sharing: { supported: true, manageable: true },
    });

    const listing = await proxiesApi.listWithSharing();

    expect(listing.sharing).toEqual({ supported: true, manageable: true });
    expect(listing.sharedItems).toEqual([]);
    expect(listing.items[0]).toEqual({
      id: "hk",
      name: "HK",
      url: "socks5://u:p@127.0.0.1:1080",
      maskedUrl: "socks5://127.0.0.1:1080",
      enabled: true,
      sharing: { all: false, tenantIds: ["t1", "t2"] },
      overriddenBy: [{ id: "t2", name: "Potato" }],
    });
    expect(listing.items[1]).toEqual({
      id: "us",
      name: "US",
      url: "http://127.0.0.1:7890",
      enabled: true,
    });
  });

  test("lists shared proxies for pickers without addresses and without overridden ones", async () => {
    const { proxiesApi } = await import("@code-proxy/api-client/endpoints/proxies");
    getMock.mockResolvedValue({
      items: [{ id: "HK-Home", name: "My HK", url: "socks5://127.0.0.1:1080", enabled: true }],
      shared_items: [
        {
          id: "sg",
          name: "Platform SG",
          enabled: true,
          description: "platform exit",
          masked_url: "socks5://203.0.113.9:1080",
          overridden: false,
        },
        // The tenant's own entry with the same ID wins: listing it again would read as two proxies.
        { id: "hk-home", name: "Platform HK", enabled: true, masked_url: "http://198.51.100.1:80", overridden: true },
        // Defensive: an own entry with the same normalized ID also hides it.
        { id: "hk home", name: "Platform HK 2", enabled: true, masked_url: "http://198.51.100.2:80" },
        { id: "", name: "no id", enabled: true },
      ],
      sharing: { supported: true, manageable: false },
    });

    const listing = await proxiesApi.listWithSharing();
    expect(listing.sharedItems).toEqual([
      {
        id: "sg",
        name: "Platform SG",
        enabled: true,
        description: "platform exit",
        maskedUrl: "socks5://203.0.113.9:1080",
        overridden: false,
      },
      {
        id: "hk-home",
        name: "Platform HK",
        enabled: true,
        maskedUrl: "http://198.51.100.1:80",
        overridden: true,
      },
      {
        id: "hk home",
        name: "Platform HK 2",
        enabled: true,
        maskedUrl: "http://198.51.100.2:80",
        overridden: false,
      },
    ]);

    const selectable = await proxiesApi.listSelectable();
    expect(selectable).toEqual([
      { id: "HK-Home", name: "My HK", url: "socks5://127.0.0.1:1080", enabled: true },
      {
        id: "sg",
        name: "Platform SG",
        url: "",
        enabled: true,
        description: "platform exit",
        maskedUrl: "socks5://203.0.113.9:1080",
        shared: true,
      },
    ]);
  });

  test("saveAll never writes the sharing view back into the pool", async () => {
    const { proxiesApi } = await import("@code-proxy/api-client/endpoints/proxies");
    putMock.mockResolvedValue({ status: "ok" });

    await proxiesApi.saveAll([
      {
        id: "hk",
        name: "HK",
        url: "socks5://127.0.0.1:1080",
        enabled: true,
        sharing: { all: true, tenantIds: [] },
        overriddenBy: [{ id: "t1", name: "Potato" }],
      },
    ]);

    expect(putMock).toHaveBeenCalledWith("/proxy-pool", {
      items: [{ id: "hk", name: "HK", url: "socks5://127.0.0.1:1080", enabled: true }],
    });
  });

  test("updates sharing of one proxy", async () => {
    const { proxiesApi } = await import("@code-proxy/api-client/endpoints/proxies");
    putMock.mockResolvedValue({ status: "ok", sharing: { all: true, tenant_ids: [] } });

    const sharing = await proxiesApi.updateSharing("hk home", { all: true, tenantIds: ["t1"] });

    expect(putMock).toHaveBeenCalledWith("/proxy-pool/hk%20home/sharing", {
      all: true,
      tenant_ids: [],
    });
    expect(sharing).toEqual({ all: true, tenantIds: [] });

    putMock.mockResolvedValue({ status: "ok", sharing: null });
    expect(await proxiesApi.updateSharing("hk", { all: false, tenantIds: [] })).toBeNull();
  });

  test("switches overriding tenants to the shared proxy", async () => {
    const { proxiesApi } = await import("@code-proxy/api-client/endpoints/proxies");
    postMock.mockResolvedValue({ status: "ok", tenants: [{ id: "t2", name: "Potato" }] });

    const tenants = await proxiesApi.adopt("hk");

    expect(postMock).toHaveBeenCalledWith("/proxy-pool/hk/adopt");
    expect(tenants).toEqual([{ id: "t2", name: "Potato" }]);
  });
});
