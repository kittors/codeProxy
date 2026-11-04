import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * 敏感词：管理端按层级编辑、给门户账号开权限，门户账号在门户里设置自己的词。
 * 后端全部用内存里的假数据：保存会真的改动它，下一次读取能读到，和真实接口一样往返。
 *
 * 设 WORD_POLICY_SHOTS_DIR 时顺便把关键画面截图存到那个目录（本地看效果用，CI 不设）。
 */

const SHOTS_DIR = process.env.WORD_POLICY_SHOTS_DIR;
const shot = async (page: Page, name: string) => {
  if (!SHOTS_DIR) return;
  // 等选中框、展开这类动画走完再拍，免得拍到半路的画面。
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOTS_DIR}/${name}.png` });
};

// 截图时把窗口拉高：管理端内容在页面自己的滚动区里，整页截图只拍得到一屏。
// WORD_POLICY_SHOTS_THEME=dark 时按深色主题拍（面板默认跟随系统）。
test.use({ colorScheme: process.env.WORD_POLICY_SHOTS_THEME === "dark" ? "dark" : "light" });
test.beforeEach(async ({ page }) => {
  if (SHOTS_DIR) await page.setViewportSize({ width: 1440, height: 1500 });
});

const DEFAULTS = {
  action: "block",
  replacement: "***",
  scan_scope: "all_user",
  block_message: "Your request was blocked by the content policy.",
  reply_filter: false,
  fold_traditional_chinese: false,
};
const LIMITS = {
  max_rules: 10000,
  max_regex: 50,
  max_keyword_chars: 128,
  max_regex_bytes: 512,
  max_regex_program: 500,
  max_regex_program_total: 2000,
  max_note_chars: 200,
  max_replacement_chars: 64,
  max_block_message_chars: 500,
};
const PORTAL_LIMITS = { ...LIMITS, max_rules: 1000, max_regex: 10 };

type Rule = { id: string; kind: "keyword" | "regex"; pattern: string; enabled: boolean };
interface StoredPolicy {
  enabled: boolean;
  action: string;
  replacement: string;
  scan_scope: string;
  reply_filter: boolean | null;
  fold_traditional_chinese: boolean | null;
  inherit_tenant: boolean;
  block_message: string;
  version: number;
  rules: Rule[];
}

/** 内存里的后端：各层策略、门户权限、收到的写请求。 */
class FakeWordBackend {
  policies = new Map<string, StoredPolicy>();
  portalDefault = false;
  overrides = new Map<string, boolean>();
  writes: Array<{ method: string; path: string; body: unknown }> = [];
  users = [
    { id: "u-alice", username: "alice", display_name: "Alice 工作室", status: "active" },
    { id: "u-bob", username: "bob", display_name: "Bob", status: "active" },
  ];
  private nextId = 1;

  constructor() {
    this.policies.set("platform:", this.policy([{ id: "p1", kind: "keyword", pattern: "平台词", enabled: true }]));
    this.policies.set("end_user:u-alice", this.policy([{ id: "a1", kind: "keyword", pattern: "竞品", enabled: true }]));
  }

  policy(rules: Rule[]): StoredPolicy {
    return {
      enabled: true,
      action: "",
      replacement: "",
      scan_scope: "",
      reply_filter: null,
      fold_traditional_chinese: null,
      inherit_tenant: true,
      block_message: "",
      version: 1,
      rules,
    };
  }

  allowed(userId: string) {
    return this.overrides.get(userId) ?? this.portalDefault;
  }

  view(scope: string, id: string) {
    const stored = this.policies.get(`${scope}:${id}`);
    const base = stored ?? { ...this.policy([]), version: 0 };
    const user = this.users.find((item) => item.id === id);
    return {
      exists: Boolean(stored),
      scope_type: scope,
      ...(id ? { scope_id: id } : {}),
      ...base,
      effective: {
        ...DEFAULTS,
        ...(base.action ? { action: base.action } : {}),
        ...(base.replacement ? { replacement: base.replacement } : {}),
      },
      rule_count: base.rules.length,
      rules_hidden: false,
      unbounded_regex_ids: [],
      can_edit: true,
      limits: scope === "end_user" ? PORTAL_LIMITS : LIMITS,
      ...(scope === "end_user" ? { end_user_name: user?.display_name, end_user_allowed: this.allowed(id) } : {}),
    };
  }

  save(scope: string, id: string, input: Record<string, unknown>) {
    const current = this.policies.get(`${scope}:${id}`);
    const rules = ((input.rules as Rule[]) ?? []).map((rule) => ({
      ...rule,
      id: rule.id || `r${this.nextId++}`,
      enabled: rule.enabled !== false,
    }));
    this.policies.set(`${scope}:${id}`, {
      ...(input as unknown as StoredPolicy),
      version: (current?.version ?? 0) + 1,
      rules,
    });
    return this.view(scope, id);
  }

  brief(scope: string, id = "") {
    const stored = this.policies.get(`${scope}:${id}`);
    return {
      exists: Boolean(stored),
      scope_type: scope,
      enabled: stored?.enabled ?? true,
      action: stored?.action ?? "",
      scan_scope: stored?.scan_scope ?? "",
      reply_filter: stored?.reply_filter ?? null,
      rule_count: stored?.rules.length ?? 0,
      version: stored?.version ?? 0,
    };
  }

  overview() {
    const portalPolicies = [...this.policies.keys()].filter((key) => key.startsWith("end_user:"));
    return {
      defaults: DEFAULTS,
      limits: LIMITS,
      guard_enabled: true,
      can_manage_platform: true,
      platform: this.brief("platform"),
      tenant: this.brief("tenant"),
      keys: [],
      portal: {
        default_allowed: this.portalDefault,
        policies: portalPolicies.length,
        active_policies: portalPolicies.filter((key) => this.allowed(key.slice("end_user:".length))).length,
      },
    };
  }

  portal() {
    return {
      default_allowed: this.portalDefault,
      limits: PORTAL_LIMITS,
      users: this.users.map((user) => {
        const policy = this.policies.get(`end_user:${user.id}`);
        return {
          ...user,
          override: this.overrides.has(user.id) ? this.overrides.get(user.id) : null,
          allowed: this.allowed(user.id),
          policy: policy ? { ...this.brief("end_user", user.id), scope_id: user.id } : null,
        };
      }),
    };
  }
}

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

const allNew = (rules: unknown[]) => ({
  summary: {
    total: rules.length,
    new: rules.length,
    duplicate: 0,
    existing: 0,
    invalid: 0,
    existing_rules: 0,
    existing_regex: 0,
    new_regex: 0,
    fits: true,
  },
  reviews: [],
});

async function mockAdmin(page: Page, backend: FakeWordBackend) {
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
    localStorage.setItem("cli-proxy-language", JSON.stringify("zh-CN"));
  });
  await page.route("**/v0/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/v0\/management/, "");
    const method = request.method();
    const body = request.postData() ? (JSON.parse(request.postData() ?? "{}") as Record<string, unknown>) : {};
    if (method !== "GET") backend.writes.push({ method, path, body });

    if (path === "/content-moderation/profiles") {
      return json(route, { items: [], capabilities: { word_guard: true, secret_masking: true, word_portal: true } });
    }
    if (path === "/content-moderation/secret-masking") return json(route, { enabled: false, persistent: true });
    if (path === "/content-moderation/word-policies") return json(route, backend.overview());
    if (path === "/content-moderation/word-policies/validate") return json(route, allNew((body.rules as unknown[]) ?? []));
    if (path === "/content-moderation/word-policies/test") {
      return json(route, {
        action: "allow",
        blocked: false,
        output: body.input,
        matches: [],
        match_count: 0,
        replaced: 0,
        layers: ["platform", "tenant"],
        reply_filter: false,
        latency_ms: 1,
      });
    }
    if (path === "/content-moderation/word-policies/portal") {
      if (method === "PUT") {
        backend.portalDefault = body.default_allowed === true;
        return json(route, { default_allowed: backend.portalDefault });
      }
      return json(route, backend.portal());
    }
    const userAccess = path.match(/^\/content-moderation\/word-policies\/portal\/users\/([^/]+)$/);
    if (userAccess) {
      const id = decodeURIComponent(userAccess[1]!);
      if (body.allowed === null) backend.overrides.delete(id);
      else backend.overrides.set(id, body.allowed === true);
      return json(route, { id, override: body.allowed, allowed: backend.allowed(id) });
    }
    const policy = path.match(/^\/content-moderation\/word-policies\/(platform|tenant|keys\/([^/]+)|end-users\/([^/]+))$/);
    if (policy) {
      const scope = policy[1]!.startsWith("keys/") ? "key" : policy[1]!.startsWith("end-users/") ? "end_user" : policy[1]!;
      const id = decodeURIComponent(policy[2] ?? policy[3] ?? "");
      if (method === "PUT") return json(route, backend.save(scope, id, body));
      if (method === "DELETE") {
        backend.policies.delete(`${scope}:${id}`);
        return route.fulfill({ status: 204 });
      }
      return json(route, backend.view(scope, id));
    }
    if (path === "/config") return json(route, { config: {} });
    if (path === "/update/check") return json(route, { has_update: false });
    return json(route, { items: [], files: [], data: [], total: 0, config: {} });
  });
}

test.describe("sensitive words in the admin panel", () => {
  test("adds several words at once and saves them with the chosen action", async ({ page }) => {
    const backend = new FakeWordBackend();
    await mockAdmin(page, backend);
    await page.goto("/#/access/content-moderation");

    // 敏感词是第一个、也是默认打开的标签，左边列出各层规则集。
    await expect(page.getByRole("tab", { name: "敏感词" })).toHaveAttribute("aria-selected", "true");
    const rail = page.getByRole("navigation", { name: "规则集" });
    await expect(rail.getByRole("button", { name: /本租户规则/ })).toHaveAttribute("aria-current", "true");
    await expect(page.getByTestId("word-policy-status")).toHaveText("尚未设置敏感词");

    const input = page.getByRole("textbox", { name: "添加敏感词" });
    await input.fill("赌博，诈骗、违禁品");
    await input.press("Enter");
    await expect(page.getByText("已加入 3 个")).toBeVisible();
    await expect(page.getByRole("cell", { name: "诈骗", exact: true })).toBeVisible();
    await expect(page.getByTestId("word-policy-status")).toHaveText("共 3 个词 · 保存后生效");

    // 命中后怎么处理在编辑器的「命中处理」页，标签上写着现在的处理方式。
    await page.getByRole("tab", { name: "命中处理 拦截请求" }).click();
    await page.getByRole("radio", { name: /替换文本/ }).click();
    await page.getByRole("textbox", { name: "替换文本" }).fill("[已屏蔽]");
    await expect(page.getByRole("tab", { name: "命中处理 替换文本" })).toBeVisible();

    // 有改动才出现保存栏。
    const saveBar = page.getByRole("region", { name: "有未保存的修改" });
    await expect(saveBar).toBeVisible();
    await shot(page, "admin-tenant-draft");
    await saveBar.getByRole("button", { name: "保存修改" }).click();
    await expect(saveBar).toBeHidden();

    const saved = backend.writes.find((write) => write.method === "PUT" && write.path.endsWith("/tenant"));
    expect(saved?.body).toMatchObject({ action: "replace", replacement: "[已屏蔽]" });
    expect(saved).toBeDefined();
    expect((saved!.body as { rules: Rule[] }).rules.map((rule) => rule.pattern)).toEqual(["赌博", "诈骗", "违禁品"]);
    await expect(page.getByTestId("word-policy-status")).toHaveText("正在检查 3 个词");
    await expect(rail.getByRole("button", { name: /本租户规则/ })).toContainText("3 个词");
    await shot(page, "admin-tenant-saved");
  });

  test("opens sensitive words to portal accounts and per account", async ({ page }) => {
    const backend = new FakeWordBackend();
    await mockAdmin(page, backend);
    await page.goto("/#/access/content-moderation");

    await page.getByRole("navigation", { name: "规则集" }).getByRole("button", { name: /门户账号/ }).click();
    await expect(page.getByRole("heading", { name: "门户账号自定义敏感词" })).toBeVisible();
    await shot(page, "admin-portal-closed");

    await page.getByRole("switch", { name: "允许所有门户账号自定义" }).click();
    await expect.poll(() => backend.portalDefault).toBe(true);

    // Bob 单独禁止：默认开放也不行。
    await page.getByRole("combobox", { name: "Bob 的自定义权限" }).click();
    await page.getByRole("option", { name: "禁止" }).click();
    await expect.poll(() => backend.overrides.get("u-bob")).toBe(false);
    await shot(page, "admin-portal-open");

    // 打开 Alice 自己的词：管理员能看到、也能代为修改。
    await page.getByRole("row", { name: /Alice 工作室/ }).getByRole("button", { name: "查看敏感词" }).click();
    await expect(page.getByRole("heading", { name: "Alice 工作室 的敏感词" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "竞品", exact: true })).toBeVisible();
    await shot(page, "admin-portal-user");
    await page.getByRole("button", { name: "返回门户账号列表" }).click();
    await expect(page.getByRole("heading", { name: "门户账号自定义敏感词" })).toBeVisible();
  });

  test("asks before dropping unsaved words when switching rule sets", async ({ page }) => {
    const backend = new FakeWordBackend();
    await mockAdmin(page, backend);
    await page.goto("/#/access/content-moderation");

    const input = page.getByRole("textbox", { name: "添加敏感词" });
    await input.fill("草稿词");
    await input.press("Enter");
    await page.getByRole("navigation", { name: "规则集" }).getByRole("button", { name: /平台规则/ }).click();
    const dialog = page.getByRole("dialog", { name: "放弃未保存的修改？" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "取消" }).click();
    await expect(page.getByRole("cell", { name: "草稿词", exact: true })).toBeVisible();
  });
});

async function mockPortal(page: Page, backend: FakeWordBackend, allowed: boolean) {
  await page.addInitScript(() => {
    localStorage.setItem(
      "code-proxy-portal-auth",
      JSON.stringify({
        apiBase: "http://127.0.0.1:8317",
        accessToken: "portal-access-token",
        refreshToken: "portal-refresh-token",
        remember: true,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
        user: { id: "u-alice", username: "alice", display_name: "Alice 工作室" },
      }),
    );
    localStorage.setItem("cli-proxy-language", JSON.stringify("zh-CN"));
  });
  await page.route("**/v0/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const body = request.postData() ? (JSON.parse(request.postData() ?? "{}") as Record<string, unknown>) : {};
    if (method !== "GET") backend.writes.push({ method, path: url.pathname, body });
    if (url.pathname === "/v0/portal/auth/me") {
      return json(route, {
        user: { id: "u-alice", tenant_id: "t1", username: "alice", display_name: "Alice 工作室", status: "active" },
        capabilities: { "access-policy": true },
        word_policy_allowed: allowed,
      });
    }
    if (url.pathname === "/v0/portal/api-keys") return json(route, { items: [], capabilities: {} });
    if (url.pathname === "/v0/portal/word-policy") {
      if (!allowed) return json(route, { error: { code: "word_policy_portal_forbidden", message: "no" } }, 403);
      if (method === "PUT") return json(route, { ...backend.save("end_user", "u-alice", body), defaults: DEFAULTS, guard_enabled: true });
      return json(route, { ...backend.view("end_user", "u-alice"), defaults: DEFAULTS, guard_enabled: true });
    }
    if (url.pathname.endsWith("/usage/chart-data")) {
      return json(route, {
        daily_series: [],
        heatmap_series: [],
        model_distribution: [],
        stats: { total: 0, success_rate: 0, total_tokens: 0, total_sessions: 0, total_cost: 0 },
      });
    }
    return json(route, { items: [], total: 0, data: [] });
  });
}

test.describe("sensitive words in the portal", () => {
  test("an allowed account keeps words of its own", async ({ page }) => {
    const backend = new FakeWordBackend();
    await mockPortal(page, backend, true);
    await page.goto("/#/apikey-lookup");

    await page.getByRole("tab", { name: "敏感词" }).click();
    await expect(page.getByRole("heading", { name: "我的敏感词" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "竞品", exact: true })).toBeVisible();

    const input = page.getByRole("textbox", { name: "添加敏感词" });
    await input.fill("内部代号\n机密");
    await page.getByRole("button", { name: "添加", exact: true }).click();
    await shot(page, "portal-draft");
    await page.getByRole("region", { name: "有未保存的修改" }).getByRole("button", { name: "保存修改" }).click();
    await expect(page.getByRole("region", { name: "有未保存的修改" })).toBeHidden();

    const saved = backend.writes.find((write) => write.method === "PUT" && write.path === "/v0/portal/word-policy");
    expect(saved).toBeDefined();
    expect((saved!.body as { rules: Rule[] }).rules.map((rule) => rule.pattern)).toEqual(["内部代号", "机密", "竞品"]);
    await shot(page, "portal-saved");
  });

  test("an account the tenant has not allowed sees no sensitive-word tab", async ({ page }) => {
    const backend = new FakeWordBackend();
    await mockPortal(page, backend, false);
    await page.goto("/#/apikey-lookup");
    await expect(page.getByRole("tab", { name: "管理 API Key" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "敏感词" })).toHaveCount(0);
  });
});
