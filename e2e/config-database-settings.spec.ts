import { expect, test, type Page } from "@playwright/test";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

/** CliRelay 存在数据库（runtime_settings）里、保存后会从 config.yaml 删掉的键（配置页编辑的那些）。 */
const DATABASE_KEYS = new Set([
  "proxy-url",
  "request-retry",
  "max-retry-interval",
  "force-model-prefix",
  "ws-auth",
  "quota-exceeded",
  "debug",
  "request-log",
  "request-log-storage",
  "logging-to-file",
  "logs-max-total-size-mb",
  "error-logs-max-files",
  "usage-statistics-enabled",
  "kimi-header-defaults",
  "payload",
]);

const setAuthed = async (page: Page) => {
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
  });
};

/**
 * 按 CliRelay 68ed2258 之后的行为模拟后端：PUT /config.yaml 把文件里写出来的数据库设置存进「数据库」，
 * 随即从文件里删掉；GET /config 给出运行中的值（代理脱敏），GET /proxy-url 给出代理原文。
 */
async function fakeBackend(page: Page, { proxyUrlFails = false, rejectSave = false } = {}) {
  let fileYaml = "port: 8318\n";
  const database: Record<string, unknown> = { "proxy-url": "", "request-retry": 5, debug: true };
  const saved: string[] = [];

  await page.route("**/v0/management/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/^.*\/v0\/management/, "");
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

    if (path === "/config.yaml") {
      if (request.method() === "PUT" && rejectSave) {
        // CliRelay 拒绝保存时回的是扁平体：error 放代码，message 放原因。
        return json({ error: "invalid_config", message: 'duplicate channel group "team-a"' }, 422);
      }
      if (request.method() === "PUT") {
        const body = request.postData() ?? "";
        saved.push(body);
        const doc = (parseYaml(body) ?? {}) as Record<string, unknown>;
        for (const key of Object.keys(doc)) {
          if (!DATABASE_KEYS.has(key)) continue;
          database[key] = doc[key];
          delete doc[key];
        }
        fileYaml = stringifyYaml(doc);
        return json({ ok: true, changed: ["config"] });
      }
      return route.fulfill({
        status: 200,
        contentType: "text/yaml; charset=utf-8",
        body: fileYaml,
      });
    }
    if (path === "/config") {
      const proxy = String(database["proxy-url"] ?? "");
      const masked = proxy ? `${proxy.replace(/\/\/[^@/]*@/, "//")}/***` : "";
      return json({ ...database, "proxy-url": masked, "runtime-setting-versions": { debug: 1 } });
    }
    if (path === "/proxy-url") {
      if (proxyUrlFails) return json({ error: "boom" }, 500);
      return json({ "proxy-url": database["proxy-url"] ?? "" });
    }
    if (path === "/codex-oauth-admission") {
      return json({ allowed_clients: [], available_allowed_clients: [] });
    }
    return json({});
  });

  return { saved, file: () => fileYaml };
}

test("Config: the saved global proxy shows again although config.yaml no longer holds it", async ({
  page,
}) => {
  await setAuthed(page);
  const backend = await fakeBackend(page);
  await page.goto("/#/system/config");

  await page.getByRole("tab", { name: /^(运行|Behavior)/ }).click();
  const network = page.locator('[data-config-section="network"]');
  const host = network.getByRole("textbox", { name: /^(主机|Host)$/ });
  const port = network.getByRole("textbox", { name: /^(端口|Port)$/ });
  const username = network.getByRole("textbox", { name: /^(用户名|Username)/ });
  const password = network.getByLabel(/^(密码|Password)/);
  await expect(host).toHaveValue("");
  // 数据库里的值照实显示，而不是空着只剩占位符。
  await expect(
    network.getByRole("textbox", { name: /^(失败重试次数|Retry attempts)$/ }),
  ).toHaveValue("5");

  await host.fill("203.0.113.7");
  await port.fill("1080");
  await username.fill("relay");
  await password.fill("p@ss");
  await page.getByRole("button", { name: /^保存$|^Save$/i }).click();

  await expect.poll(() => backend.saved.length).toBe(1);
  const saved = parseYaml(backend.saved[0]!) as Record<string, unknown>;
  expect(saved["proxy-url"]).toBe("socks5://relay:p%40ss@203.0.113.7:1080");
  // 没碰的数据库设置不跟着写回去，免得盖掉别人在这期间的修改。
  expect(Object.keys(saved).filter((key) => DATABASE_KEYS.has(key))).toEqual(["proxy-url"]);
  expect(backend.file()).not.toContain("proxy-url");
  await expect(host).toHaveValue("203.0.113.7");

  // 整页重新打开：文件里已经没有代理，仍从运行中的配置回显，账号密码也在。
  await page.reload();
  await page.getByRole("tab", { name: /^(运行|Behavior)/ }).click();
  await expect(host).toHaveValue("203.0.113.7");
  await expect(port).toHaveValue("1080");
  await expect(username).toHaveValue("relay");
  await expect(password).toHaveValue("p@ss");
  await network.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/config-database-settings/proxy-after-reload.png" });

  await page.getByRole("tab", { name: /源码编辑|Source Editor/i }).click();
  await expect(
    page.getByText(/存在数据库里，不在这个文件中|live in the database, not in this file/),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/config-database-settings/source-hint.png" });
});

test("Config: database-backed settings lock with a warning when their running values can't be read", async ({
  page,
}) => {
  await setAuthed(page);
  await fakeBackend(page, { proxyUrlFails: true });
  await page.goto("/#/system/config");

  await expect(
    page.getByText(/没读到存在数据库里的设置|Couldn't read the settings stored in the database/),
  ).toBeVisible();
  await page.getByRole("tab", { name: /^(运行|Behavior)/ }).click();
  const network = page.locator('[data-config-section="network"]');
  await expect(network.getByRole("textbox", { name: /^(主机|Host)$/ })).toBeDisabled();
  await expect(network.getByRole("switch", { name: /IPv4/ })).toBeEnabled();
  await page.screenshot({ path: "test-results/config-database-settings/locked.png" });
});

test("Config: a rejected save shows the server's reason, not just its code", async ({ page }) => {
  await setAuthed(page);
  await fakeBackend(page, { rejectSave: true });
  await page.goto("/#/system/config");

  await page.getByRole("tab", { name: /^(运行|Behavior)/ }).click();
  await page
    .locator('[data-config-section="network"]')
    .getByRole("textbox", { name: /^(失败重试次数|Retry attempts)$/ })
    .fill("6");
  await page.getByRole("button", { name: /^保存$|^Save$/i }).click();

  // 以前只弹出 invalid_config，看不出是哪里写错了。
  await expect(
    page.getByRole("alert").filter({ hasText: 'invalid_config: duplicate channel group "team-a"' }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/config-database-settings/rejected-save-reason.png" });
});
