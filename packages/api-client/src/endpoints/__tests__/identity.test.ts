import { beforeEach, describe, expect, test, vi } from "vitest";
import { apiClient } from "../../client/client";
import { identityApi } from "../identity";

describe("identityApi", () => {
  beforeEach(() => {
    apiClient.setConfig({ apiBase: "http://localhost:8317", managementKey: "" });
    apiClient.setDefaultHeaders({});
    vi.restoreAllMocks();
  });

  test("logs in through the public auth endpoint", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "cps_test",
          token_type: "Bearer",
          expires_at: "2026-08-01T00:00:00Z",
          principal: {},
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    await identityApi.login({ username: "admin", password: "secret", remember_me: false });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(new URL(String(url)).pathname).toBe("/v0/auth/login");
    expect(JSON.parse(String(init?.body))).toEqual({
      username: "admin",
      password: "secret",
      remember_me: false,
    });
  });

  test("adds the effective tenant header to management calls", async () => {
    apiClient.setConfig({ apiBase: "http://localhost:8317", managementKey: "cps_test" });
    apiClient.setDefaultHeaders({ "X-Effective-Tenant-ID": "tenant-a" });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await identityApi.users();
    const headers = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(headers.get("X-Effective-Tenant-ID")).toBe("tenant-a");
    expect(headers.get("Authorization")).toBe("Bearer cps_test");
  });

  test("creates tenants without a caller-provided identifier", async () => {
    apiClient.setConfig({ apiBase: "http://localhost:8317", managementKey: "cps_test" });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ tenant: {}, admin: {} }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await identityApi.createTenant({
      name: "Tenant A",
      description: "Primary tenant",
      expires_at: "2030-01-01T00:00:00Z",
      admin_username: "tenant-admin",
      admin_display_name: "Tenant Admin",
      admin_password: "tenant-password-123",
    });
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).not.toHaveProperty("slug");
  });

  test("creates roles without a caller-provided code", async () => {
    apiClient.setConfig({ apiBase: "http://localhost:8317", managementKey: "cps_test" });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "role-a" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await identityApi.createRole({
      name: "Operator",
      description: "Operates users",
      permissions: [],
    });
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      name: "Operator",
      description: "Operates users",
      permissions: [],
    });
  });

  test("updates tenant details with optimistic versioning", async () => {
    apiClient.setConfig({ apiBase: "http://localhost:8317", managementKey: "cps_test" });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "tenant-a" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await identityApi.updateTenant("tenant-a", {
      name: "Tenant A",
      description: "Updated",
      version: 3,
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(new URL(String(url)).pathname).toBe("/v0/management/tenants/tenant-a");
    expect(init?.method).toBe("PATCH");
    expect(JSON.parse(String(init?.body))).toEqual({
      name: "Tenant A",
      description: "Updated",
      version: 3,
    });
  });
  test("updates menu configuration with optimistic versioning", async () => {
    apiClient.setConfig({ apiBase: "http://localhost:8317", managementKey: "cps_test" });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ code: "system.menus" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await identityApi.updateMenu("system.menus", {
      visible: true,
      enabled: true,
      sort_order: 40,
      version: 2,
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(new URL(String(url)).pathname).toBe("/v0/management/menus/system.menus");
    expect(init?.method).toBe("PATCH");
    expect(JSON.parse(String(init?.body))).toEqual({
      visible: true,
      enabled: true,
      sort_order: 40,
      version: 2,
    });
  });

  test("replaces users assigned to a role", async () => {
    apiClient.setConfig({ apiBase: "http://localhost:8317", managementKey: "cps_test" });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 204 }));
    await identityApi.replaceRoleUsers("role-a", ["user-a", "user-b"], 4);
    const [url, init] = fetchMock.mock.calls[0];
    expect(new URL(String(url)).pathname).toBe("/v0/management/roles/role-a/users");
    expect(init?.method).toBe("PUT");
    expect(JSON.parse(String(init?.body))).toEqual({
      user_ids: ["user-a", "user-b"],
      version: 4,
    });
  });
});
