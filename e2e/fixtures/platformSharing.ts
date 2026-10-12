import type { Page } from "@playwright/test";

/*
 * Mocked management API for the platform-shared resources specs (CliRelay resource grants):
 * the system tenant's view with `sharing` / `overridden_by` / `tenant_copies`, and a granted
 * tenant's view with `shared_items` / `shared_files`. Writes are captured for assertions.
 */

export const TENANTS = [
  {
    id: "00000000-0000-0000-0000-000000000001",
    name: "System Administration",
    type: "system",
    status: "active",
    effective_status: "active",
  },
  {
    id: "t-potato",
    name: "土豆服务器",
    type: "standard",
    status: "active",
    effective_status: "active",
  },
  {
    id: "t-wujing",
    name: "无境科技",
    type: "standard",
    status: "active",
    effective_status: "active",
  },
  {
    id: "t-meiwei",
    name: "美微智造",
    type: "standard",
    status: "disabled",
    effective_status: "disabled",
  },
].map((tenant) => ({
  slug: tenant.id,
  expires_at: null,
  description: "",
  version: 1,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
  ...tenant,
}));

export const SYSTEM_PROXY_POOL = {
  items: [
    {
      id: "hk-residential",
      name: "HK residential",
      url: "socks5://user:pass@82.21.231.140:7454",
      masked_url: "socks5://82.21.231.140:7454",
      enabled: true,
      description: "Codex egress",
      sharing: { all: false, tenant_ids: ["t-potato", "t-wujing"] },
      overridden_by: [{ id: "t-wujing", name: "无境科技" }],
    },
    {
      id: "sg-datacenter",
      name: "SG datacenter",
      url: "http://45.38.111.81:5996",
      masked_url: "http://45.38.111.81:5996",
      enabled: true,
      sharing: { all: true, tenant_ids: [] },
    },
    {
      id: "us-west",
      name: "US West",
      url: "socks5://203.0.113.8:7893",
      masked_url: "socks5://203.0.113.8:7893",
      enabled: true,
    },
  ],
  sharing: { supported: true, manageable: true },
};

export const TENANT_PROXY_POOL = {
  items: [
    {
      id: "hk-residential",
      name: "My HK",
      url: "socks5://me:pw@10.0.0.1:1080",
      masked_url: "socks5://10.0.0.1:1080",
      enabled: true,
    },
  ],
  shared_items: [
    {
      id: "hk-residential",
      name: "HK residential",
      enabled: true,
      masked_url: "socks5://82.21.231.140:7454",
      overridden: true,
    },
    {
      id: "sg-datacenter",
      name: "SG datacenter",
      enabled: true,
      description: "Platform exit",
      masked_url: "http://45.38.111.81:5996",
      overridden: false,
    },
  ],
  sharing: { supported: true, manageable: false },
};

const account = (name: string, label: string, extra: Record<string, unknown> = {}) => ({
  id: name,
  name,
  label,
  type: "codex",
  provider: "codex",
  account_type: "oauth",
  auth_index: `${name}-index`,
  size: 1024,
  modified: 1784534400000,
  disabled: false,
  ...extra,
});

export const SYSTEM_AUTH_FILES = {
  files: [
    account("codex-ops.json", "Codex Ops", {
      sharing: { all: false, tenant_ids: ["t-potato"] },
      tenant_copies: [{ id: "t-wujing", name: "无境科技" }],
    }),
    account("codex-team.json", "Codex Team"),
  ],
  sharing: { supported: true, manageable: true },
};

export const TENANT_AUTH_FILES = {
  files: [account("my-codex.json", "My Codex", { duplicates_shared: true })],
  shared_files: [
    {
      id: "codex-ops.json",
      name: "codex-ops.json",
      label: "Codex Ops",
      email: "ops@example.com",
      type: "codex",
      provider: "codex",
      account_type: "oauth",
      plan_type: "pro",
      disabled: false,
      shared: true,
    },
    {
      id: "claude-max.json",
      name: "claude-max.json",
      label: "Claude Max",
      type: "claude",
      provider: "claude",
      account_type: "oauth",
      plan_type: "max",
      disabled: true,
      concurrency_limit: 4,
      shared: true,
    },
  ],
  sharing: { supported: true, manageable: false },
};

type Captured = { method: string; path: string; body: unknown };

export const setAuthed = async (page: Page) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "code-proxy-admin-auth",
      JSON.stringify({
        apiBase: "http://127.0.0.1:8317",
        managementKey: "test-management-key",
        rememberPassword: true,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      }),
    );
    localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    localStorage.setItem("authFilesPage.quotaAutoRefreshMs.v1", JSON.stringify(0));
  });
};

export const routeManagementMocks = async (
  page: Page,
  data: { proxyPool?: unknown; authFiles?: unknown },
) => {
  const writes: Captured[] = [];
  const json = (body: unknown) => ({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });

  await page.route("**/v0/management/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^.*\/v0\/management/, "");
    const method = request.method();
    if (method !== "GET" && path !== "/proxy-pool/check" && !path.startsWith("/ai-accounts")) {
      writes.push({ method, path, body: request.postDataJSON() });
    }

    if (path === "/proxy-pool/check") return route.fulfill(json({ ok: true, latency_ms: 86 }));
    if (path === "/proxy-pool" && method === "GET")
      return route.fulfill(json(data.proxyPool ?? { items: [] }));
    if (path.endsWith("/sharing") && path.startsWith("/proxy-pool/")) {
      const body = request.postDataJSON() as { all: boolean; tenant_ids: string[] };
      return route.fulfill(
        json({ status: "ok", sharing: body.all || body.tenant_ids.length ? body : null }),
      );
    }
    if (path.endsWith("/adopt")) {
      return route.fulfill(json({ status: "ok", tenants: [{ id: "t-wujing", name: "无境科技" }] }));
    }
    if (path === "/tenants") return route.fulfill(json({ items: TENANTS }));
    if (path === "/auth-files" && method === "GET")
      return route.fulfill(json(data.authFiles ?? { files: [] }));
    if (path === "/auth-files/sharing") {
      const body = request.postDataJSON() as { ids: string[]; all: boolean; tenant_ids: string[] };
      return route.fulfill(
        json({
          status: "ok",
          ids: body.ids,
          sharing:
            body.all || body.tenant_ids.length
              ? { all: body.all, tenant_ids: body.tenant_ids }
              : null,
        }),
      );
    }
    if (path.startsWith("/ai-accounts/status-refresh/")) {
      return route.fulfill(
        json({ job_id: "job", state: "completed", total: 0, completed: 0, failed: 0, results: [] }),
      );
    }
    if (path === "/ai-accounts/status-refresh") {
      return route.fulfill(json({ job_id: "job", accepted: 0, deduplicated: 0 }));
    }
    if (path === "/ai-accounts/status") return route.fulfill(json({ items: [] }));
    if (path === "/usage/entity-stats") return route.fulfill(json({ source: [], auth_index: [] }));
    if (path === "/model-configs" || path === "/model-owner-presets")
      return route.fulfill(json([]));
    return route.fulfill(json({}));
  });

  return { writes };
};
