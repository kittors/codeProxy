import { expect, test, type Page } from "@playwright/test";

/**
 * 门户账号页的上游冻结（CliRelay internal/accessfreeze）：上游以内容安全为由拒绝请求后，
 * 网关按上游类型冻结发起方。这里核对列表行的标签、页面级总览（含不属于门户账号的 Key 和阈值）、
 * 账号详情（生效中、已解冻、拒绝证据）与解冻在真实浏览器里的样子。数据全部 mock。
 *
 * 面板会自动更新到旧后端：后端没声明 access-freezes 能力时，这些界面一个都不该出现。
 * 浏览器是 Desktop Chrome（en-US），所以按英文文案断言；数据里的人名照旧是中文。
 */

const setAuthed = async (page: Page) => {
  await page.addInitScript(() => {
    localStorage.removeItem("codeProxy.dataTable.columnOrder.v1.end-users");
    localStorage.removeItem("codeProxy.dataTable.columnWidths.v3.end-users");
    localStorage.setItem(
      "code-proxy-admin-auth",
      JSON.stringify({
        apiBase: "http://127.0.0.1:8317",
        managementKey: "test-management-key",
        rememberPassword: true,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      }),
    );
  });
};

const account = (id: string, username: string, displayName: string) => ({
  id,
  tenant_id: "tenant-e2e",
  username,
  display_name: displayName,
  status: "active",
  must_change_password: false,
  last_login_at: "2026-11-13T10:41:47Z",
  created_at: "2026-05-13T15:32:00Z",
  updated_at: "2026-05-13T15:32:00Z",
  version: 1,
  api_key_count: 2,
});

const notice =
  "Access to Codex is frozen for this account since 2026-11-13 18:17 +08:00: the upstream's safety check refused a request from it for possible cybersecurity risk (cyber_policy). Other upstreams are not affected. Contact your administrator to restore it. 本账号的 Codex 使用权限已于 2026-11-13 18:17 +08:00 冻结：上游安全检查以可能存在网络安全风险为由（cyber_policy）拒绝了来自本账号的请求。其他上游不受影响，如需恢复请联系管理员。";

const upstreamMessage =
  "This content was flagged for possible cybersecurity risk. If this seems wrong, try rephrasing your request.";

const standing = {
  id: 11,
  subject: { tenant_id: "tenant-e2e", kind: "end_user", id: "user-frozen" },
  subject_name: "张三",
  provider: "codex",
  provider_name: "Codex",
  reason_code: "cyber_policy",
  upstream_message: upstreamMessage,
  model: "gpt-6.1-sol",
  auth_label: "pool-a@example.com",
  request_id: "req-7f3a",
  strike_count: 2,
  frozen_at: "2026-11-13T10:17:22Z",
  notice,
};

const orphanKey = {
  ...standing,
  id: 12,
  subject: { tenant_id: "tenant-e2e", kind: "api_key", id: "key-orphan-0001" },
  subject_name: "ci-runner",
  strike_count: 1,
};

const released = {
  ...standing,
  id: 5,
  strike_count: 1,
  frozen_at: "2026-11-10T03:00:00Z",
  released_at: "2026-11-11T02:00:00Z",
  released_by: "root",
  release_note: "已与用户确认是授权的安全测试",
};

const strike = (id: number, createdAt: string) => ({
  id,
  subject: standing.subject,
  provider: "codex",
  provider_name: "Codex",
  reason_code: "cyber_policy",
  upstream_message: upstreamMessage,
  model: "gpt-6.1-sol",
  auth_label: "pool-a@example.com",
  request_id: `req-${id}`,
  created_at: createdAt,
});

const mockApis = async (page: Page, capability: boolean) => {
  let active = [standing, orphanKey];
  const releases: number[] = [];
  await page.route("**/v0/management/**", async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

    if (url.pathname.endsWith("/v0/management/end-users") && method === "GET") {
      return json({
        items: [account("user-frozen", "zhangsan", "张三"), account("user-ok", "lisi", "李四")],
        capabilities: {
          "access-policy": true,
          "owned-key-admin": true,
          "access-freezes": capability,
        },
      });
    }
    if (url.pathname.endsWith("/end-users/access-freezes/settings")) {
      return json({ threshold: 1, default_threshold: 1, max_threshold: 100 });
    }
    if (url.pathname.endsWith("/end-users/access-freezes/strikes")) {
      return json({
        items: [strike(32, "2026-11-13T10:20:05Z"), strike(31, "2026-11-13T10:17:22Z")],
      });
    }
    const release = url.pathname.match(/\/end-users\/access-freezes\/(\d+)\/release$/);
    if (release && method === "POST") {
      const id = Number(release[1]);
      releases.push(id);
      const freeze = active.find((item) => item.id === id);
      active = active.filter((item) => item.id !== id);
      return json({
        freeze: { ...freeze, released_at: "2026-11-13T12:00:00Z", released_by: "root" },
      });
    }
    if (url.pathname.endsWith("/end-users/access-freezes")) {
      const subjectId = url.searchParams.get("subject_id");
      let items = url.searchParams.get("status") === "active" ? active : [...active, released];
      if (subjectId) items = items.filter((item) => item.subject.id === subjectId);
      return json({ items });
    }
    return json({});
  });
  return releases;
};

test.describe("portal accounts: upstream freezes", () => {
  test("shows a frozen upstream on the row, in the overview and in the detail, and releases it", async ({
    page,
  }) => {
    await setAuthed(page);
    const releases = await mockApis(page, true);
    await page.goto("/#/access/end-users");

    const frozenRow = page.getByRole("row", { name: /张三/ });
    await expect(frozenRow.getByText("Codex frozen")).toBeVisible();
    await expect(page.getByRole("row", { name: /李四/ }).getByText("Codex frozen")).toHaveCount(0);

    await page.getByRole("button", { name: /^Upstream freezes/ }).click();
    const overview = page.getByRole("dialog", { name: "Upstream freezes" });
    await expect(overview.getByText("ci-runner")).toBeVisible();
    await expect(overview.getByText("张三")).toBeVisible();
    await expect(overview.getByLabel("Freeze after this many refusals")).toHaveValue("1");
    await page.keyboard.press("Escape");
    await expect(overview).toBeHidden();

    await frozenRow.getByText("Codex frozen").click();
    const detail = page.getByRole("dialog", { name: /Upstream freezes · / });
    await expect(detail.getByText("In effect")).toBeVisible();
    await expect(detail.getByText("Released", { exact: true })).toBeVisible();
    await expect(detail.getByText("已与用户确认是授权的安全测试")).toBeVisible();
    await expect(detail.getByText("pool-a@example.com").first()).toBeVisible();

    await detail.getByRole("button", { name: "Release" }).first().click();
    const confirm = page.getByRole("dialog", { name: "Release the freeze" });
    await confirm.getByLabel("Note").fill("已核实");
    await confirm.getByRole("button", { name: "Release" }).click();
    await expect.poll(() => releases).toEqual([11]);
    await expect(confirm).toBeHidden();
  });

  test("shows none of it when the backend does not declare the capability", async ({ page }) => {
    await setAuthed(page);
    await mockApis(page, false);
    await page.goto("/#/access/end-users");
    await expect(page.getByRole("row", { name: /张三/ })).toBeVisible();
    await expect(page.getByText("Codex frozen")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Upstream freezes/ })).toHaveCount(0);
  });
});
