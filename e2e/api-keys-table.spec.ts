import { expect, test, type Page } from "@playwright/test";

/**
 * API Key 表（DataGrid）。
 *
 * API Key 现在收在「门户账号」下面：`/access/api-keys?endUserId=<id>` 是某个门户账号自己的 Key
 * 列表（OwnedApiKeysTable），裸的 /access/api-keys 和旧入口 /api-keys 自 07-18（eb38909a）起都
 * 重定向到门户账号页。这张表只冻结右侧的「操作」列；冻结列、拖宽、横向滚动的不变量在它上面验证。
 *
 * 原 API Key 整表左侧还冻结了勾选列和名称列，这张表没有左侧冻结列，所以左侧冻结的那几条
 * （深色悬停不透明、滚动时贴住左缘、拖宽时冻结区边缘跟着走）改在门户账号表上验证：它的勾选列和
 * 「账号」冻结在左。门户账号表右侧冻结列的几何由 end-users-fixed-column-alignment.spec 覆盖，
 * 这里不重复。
 *
 * 新表格的冻结列就是同一个滚动视口里的 position: sticky 单元格，边缘阴影是冻结格边上的伪元素，
 * 由根节点的 data-x-scrolled / data-x-at-end 控制显隐，没有旧 DataTable 那层「冻结轨道」和拖宽
 * 预览覆盖层；拖宽是实时的，参考线（[data-grid-resize-guide]）贴着列的右缘，宽度角标
 * （[data-grid-resize-badge]）跟着参考线、收在中间可滚动的那一段里。
 *
 * 原先的两例没有迁过来：「受限模型摘要在圆角胶囊里截断」和「导入到 CC Switch 的深链」测的是
 * 不带 endUserId 的整表（ApiKeyColumns 的模型列和行操作）。路由只在带 endUserId 时渲染
 * ApiKeysPage，这时它换成上面那张表，没有模型列也没有导入操作，浏览器里进不到那两处。
 * 导入深链的内容由 ApiKeysPage.test.tsx（从卡片列表导入 Codex 预设）和 ccswitchImportLink.test.ts
 * （auth/config 两段、model_reasoning_effort、不带 model_catalog_json）覆盖；胶囊截断要真实布局，
 * 目前没有替代覆盖。
 */

const END_USER_ID = "end-user-e2e";
/** 门户账号的「管理 Key」打开的就是这个地址。 */
const API_KEYS_URL = `/#/access/api-keys?endUserId=${END_USER_ID}`;
/** 旧 DataTable 存这张表列宽的键：第一次打开时迁到新偏好（实际像素换成设计像素），再删掉。 */
const LEGACY_WIDTHS_KEY = "codeProxy.dataTable.columnWidths.v3.owned-api-keys";
const GRID_PREFS_KEY = "cp-grid:owned-api-keys:v1";
/** Satin 原生固定列边缘采用 1px 细线 + 柔雾 box-shadow 投影，杜绝旧版 22px 遮罩盖字。 */
const PIN_EDGE_WIDTH = "1px";

type SetAuthedOptions = {
  /** 旧表格存下的这张表的列宽（实际像素）。 */
  legacyColumnWidths?: Record<string, number>;
  dark?: boolean;
};

const setAuthed = async (page: Page, options: SetAuthedOptions = {}) => {
  await page.addInitScript(
    ({ authOptions, legacyKey }: { authOptions: SetAuthedOptions; legacyKey: string }) => {
      // 只在第一次加载时种下旧列宽（迁移后旧键会被删掉，reload 不该再种回去）。
      if (authOptions.legacyColumnWidths && !sessionStorage.getItem("e2e-legacy-seeded")) {
        sessionStorage.setItem("e2e-legacy-seeded", "1");
        localStorage.setItem(legacyKey, JSON.stringify(authOptions.legacyColumnWidths));
      }
      if (authOptions.dark) localStorage.setItem("code-proxy-admin-theme", "dark");
      localStorage.setItem(
        "code-proxy-admin-auth",
        JSON.stringify({
          apiBase: "http://127.0.0.1:8317",
          managementKey: "test-management-key",
          rememberPassword: true,
          expiresAt: Date.now() + 24 * 60 * 60 * 1000,
        }),
      );
    },
    { authOptions: options, legacyKey: LEGACY_WIDTHS_KEY },
  );
};

const jsonResponse = (body: unknown) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify(body),
});

/**
 * 一个门户账号名下的九把 Key。列加起来约 1500 设计像素，1360 宽的窗口里要横向滚动。
 * 页面以 owner 列表（/end-users/<id>/api-keys）为准；明文走兼容接口 /api-key-entries 补全，
 * 只用来显示掩码和复制。
 */
const mockOwnedApiKeysApis = async (page: Page) => {
  const suffixes = ["whc", "0zb", "1ll", "soe", "3fv", "7om", "lmk", "cyj", "bex"];
  const keys = suffixes.map((suffix, index) => ({
    id: `key-${suffix}`,
    tenant_id: "tenant-e2e",
    end_user_id: END_USER_ID,
    name: index === 0 ? "Default Key" : `Fixed Row ${index + 1}`,
    disabled: false,
    is_default: index === 0,
    created_at: "2026-05-13T15:32:00Z",
    "daily-spending-used": 1.23,
    "lifetime-spending-used": 45.67,
    "daily-spending-reset-count": index % 3,
  }));
  const secrets = suffixes.map((suffix) => ({
    id: `key-${suffix}`,
    end_user_id: END_USER_ID,
    key: `sk-e2e-${"x".repeat(24)}-${suffix}`,
  }));

  await page.route("**/v0/management/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith(`/v0/management/end-users/${END_USER_ID}/api-keys`)) {
      return route.fulfill(jsonResponse({ items: keys }));
    }
    if (pathname.endsWith("/v0/management/api-key-entries")) {
      return route.fulfill(jsonResponse({ "api-key-entries": secrets }));
    }
    return route.fulfill(jsonResponse({}));
  });
};

const openApiKeys = async (page: Page) => {
  await page.goto(API_KEYS_URL);
  await expect(page).toHaveURL(/#\/access\/api-keys\?endUserId=/);
  await page
    .locator('tr[data-row-key] td[data-col="actions"]')
    .first()
    .waitFor({ state: "visible" });
};

/**
 * 门户账号列表：九个账号，内容足够长，1360 宽下要横向滚动；声明「批量绑定权限模板」并给一个
 * 模板，表格才带勾选列（和原 API Key 整表一样左侧冻结两列：勾选列和「账号」）。
 */
const mockPortalAccountsApis = async (page: Page) => {
  const items = Array.from({ length: 9 }, (_, index) => ({
    id: `end-user-${index}`,
    tenant_id: "tenant-e2e",
    username: `e2e-portal-account-with-a-long-name-${index}`,
    display_name: `E2E Portal Account ${index}`,
    status: "active",
    must_change_password: false,
    last_login_at: "2026-09-12T10:41:47Z",
    created_at: "2026-05-13T15:32:00Z",
    updated_at: "2026-05-13T15:32:00Z",
    version: 1,
    api_key_count: 1,
    "daily-spending-used": 12.34,
    "lifetime-spending-used": 567.89,
    "daily-limit": index % 2 === 0 ? 2000 : undefined,
    "concurrency-limit": 10,
    "rpm-limit": 60,
    "tpm-limit": 100000,
  }));

  await page.route("**/v0/management/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith("/v0/management/end-users")) {
      return route.fulfill(
        jsonResponse({ items, capabilities: { "batch-profile-binding": true } }),
      );
    }
    if (pathname.endsWith("/v0/management/api-key-permission-profiles")) {
      return route.fulfill(
        jsonResponse({
          "api-key-permission-profiles": [{ id: "profile-default", name: "Default" }],
        }),
      );
    }
    return route.fulfill(jsonResponse({}));
  });
};

const openPortalAccounts = async (page: Page) => {
  await page.goto("/#/access/end-users");
  await page
    .locator('tr[data-row-key] td[data-col="account"]')
    .first()
    .waitFor({ state: "visible" });
};

/** 横向滚动到指定位置，等两帧让滚动状态和阴影落定。 */
const scrollGridTo = async (page: Page, where: "start" | "middle" | "end") =>
  page.evaluate(async (position) => {
    const viewport = document.querySelector<HTMLElement>(".sn-tbl-sc");
    if (!viewport) throw new Error("Missing grid viewport");
    const max = viewport.scrollWidth - viewport.clientWidth;
    viewport.scrollLeft = position === "start" ? 0 : position === "end" ? max : Math.round(max / 2);
    viewport.dispatchEvent(new Event("scroll"));
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    return { scrollLeft: viewport.scrollLeft, max };
  }, where);

type EndPinnedGeometry = {
  scrollLeft: number;
  maxScrollLeft: number;
  viewportRight: number;
  actionsHeaderLeft: number;
  actionsHeaderRight: number;
  actionsLeft: number;
  actionsRight: number;
  lastColumnRight: number;
  lastColumnHit: string | null;
  edgeHit: string | null;
  endShadow: string;
  shadowLeft: string;
  shadowWidth: string;
  shadowBox: string;
  actionsHeaderBorderLeft: string;
  actionsCellBorderLeft: string;
};

/** 读 API Key 表右侧冻结区的几何：操作列、它左边的最后一列（创建时间）、阴影。 */
const readEndPinnedGeometry = (page: Page): Promise<EndPinnedGeometry> =>
  page.evaluate(() => {
    const viewport = document.querySelector<HTMLElement>(".sn-tbl-sc");
    const row = document.querySelector<HTMLElement>("tr[data-row-key]");
    const actionsHeader = document.querySelector<HTMLElement>('th[data-col="actions"]');
    const actionsCell = row?.querySelector<HTMLElement>('td[data-col="actions"]');
    const lastColumn = row?.querySelector<HTMLElement>('td[data-col="created"]');
    if (!viewport || !row || !actionsHeader || !actionsCell || !lastColumn) {
      throw new Error("Missing pinned action column geometry");
    }
    const viewportRect = viewport.getBoundingClientRect();
    const headerRect = actionsHeader.getBoundingClientRect();
    const cellRect = actionsCell.getBoundingClientRect();
    const lastRect = lastColumn.getBoundingClientRect();
    const columnAt = (x: number, y: number) =>
      document.elementFromPoint(x, y)?.closest<HTMLElement>("td[data-col]")?.dataset.col ?? null;
    const shadow = getComputedStyle(actionsCell, "::before");
    return {
      scrollLeft: viewport.scrollLeft,
      maxScrollLeft: viewport.scrollWidth - viewport.clientWidth,
      viewportRight: viewportRect.left + viewport.clientWidth,
      actionsHeaderLeft: headerRect.left,
      actionsHeaderRight: headerRect.right,
      actionsLeft: cellRect.left,
      actionsRight: cellRect.right,
      lastColumnRight: lastRect.right,
      lastColumnHit: columnAt(lastRect.right - 8, lastRect.top + lastRect.height / 2),
      edgeHit: columnAt(cellRect.left + 2, cellRect.top + cellRect.height / 2),
      endShadow: shadow.opacity,
      shadowLeft: shadow.left,
      shadowWidth: shadow.width,
      shadowBox: shadow.boxShadow,
      actionsHeaderBorderLeft: getComputedStyle(actionsHeader).borderLeftWidth,
      actionsCellBorderLeft: getComputedStyle(actionsCell).borderLeftWidth,
    };
  });

const expectActionsHugTheRightEdge = (state: EndPinnedGeometry) => {
  // 操作列贴住视口右缘，表头和单元格在同一条竖线上开始遮挡。
  expect(state.actionsRight).toBeGreaterThanOrEqual(state.viewportRight - 1);
  expect(state.actionsRight).toBeLessThanOrEqual(state.viewportRight + 1);
  expect(state.actionsHeaderRight).toBeGreaterThanOrEqual(state.viewportRight - 1);
  expect(state.actionsHeaderRight).toBeLessThanOrEqual(state.viewportRight + 1);
  expect(Math.abs(state.actionsHeaderLeft - state.actionsLeft)).toBeLessThanOrEqual(1);
  // Satin 原生 1px 细线 + 柔和 box-shadow 离边投影，绝不覆盖相邻列；冻结格盖住的第一个像素已经属于操作列。
  expect(state.shadowLeft).toBe("0px");
  expect(state.shadowWidth).toBe(PIN_EDGE_WIDTH);
  expect(state.shadowBox).not.toBe("none");
  expect(state.edgeHit).toBe("actions");
};

test("API Keys: dark hover keeps the pinned action column opaque above scrolled content", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1360, height: 980 });
  await setAuthed(page, { dark: true });
  await mockOwnedApiKeysApis(page);
  await openApiKeys(page);

  const scrolled = await scrollGridTo(page, "middle");
  expect(scrolled.scrollLeft).toBeGreaterThan(0);

  // 悬停在中间滚动区的格子上：整行进入悬停态，冻结的操作列跟着换悬停底色。
  const hoverPoint = await page.evaluate(() => {
    const viewport = document.querySelector<HTMLElement>(".sn-tbl-sc");
    const row = document.querySelector<HTMLElement>("tr[data-row-key]");
    if (!viewport || !row) throw new Error("Missing grid rows");
    const rowRect = row.getBoundingClientRect();
    return { x: viewport.getBoundingClientRect().left + 24, y: rowRect.top + rowRect.height / 2 };
  });
  await page.mouse.move(hoverPoint.x, hoverPoint.y);

  const state = await page.evaluate(() => {
    const row = document.querySelector<HTMLElement>("tr[data-row-key]");
    const actionsCell = row?.querySelector<HTMLElement>('td[data-col="actions"]');
    if (!row || !actionsCell) throw new Error("Missing dark hover table cells");

    const backgroundColor = getComputedStyle(actionsCell).backgroundColor;
    const slashAlpha = backgroundColor.match(/\/\s*([0-9.]+%?)\s*\)?$/)?.[1];
    const commaAlpha = backgroundColor.startsWith("rgba(")
      ? backgroundColor.slice(5, -1).split(",").at(3)?.trim()
      : undefined;
    const rawAlpha = slashAlpha ?? commaAlpha;
    const alpha = rawAlpha?.endsWith("%")
      ? Number(rawAlpha.slice(0, -1)) / 100
      : Number(rawAlpha ?? 1);

    const rect = actionsCell.getBoundingClientRect();
    const columnAt = (x: number) =>
      document.elementFromPoint(x, rect.top + rect.height / 2)?.closest<HTMLElement>("td[data-col]")
        ?.dataset.col ?? null;

    return {
      isDark: document.documentElement.classList.contains("dark"),
      rowHovered: row.matches(":hover"),
      actionsAlpha: Number.isFinite(alpha) ? alpha : 1,
      actionsPosition: getComputedStyle(actionsCell).position,
      actionsPin: actionsCell.dataset.pin ?? null,
      edgeHit: columnAt(rect.left + 2),
      innerHit: columnAt(rect.right - Math.min(24, rect.width / 2)),
    };
  });

  expect(state.isDark).toBe(true);
  expect(state.rowHovered).toBe(true);
  // 悬停色也必须是不透明的：冻结格盖在滚动内容上，半透明会透出底下滚过去的列。
  expect(state.actionsAlpha).toBe(1);
  expect(state.actionsPosition).toBe("sticky");
  expect(state.actionsPin).toBe("end");
  expect(state.edgeHit).toBe("actions");
  expect(state.innerHit).toBe("actions");
});

test("API Keys: a restored wider column stops shrinking at its minimum width", async ({ page }) => {
  await page.setViewportSize({ width: 1360, height: 980 });
  // 旧表格存的实际像素（14.4px 根字号下 360px）第一次打开时迁成设计像素（400）。
  // 「密钥」列在最左边的几列里：滚动起点上整列可见，右缘离冻结的操作列很远。
  await setAuthed(page, { legacyColumnWidths: { key: 360 } });
  await mockOwnedApiKeysApis(page);
  await openApiKeys(page);

  const header = page.locator('th[data-col="key"]');
  await expect
    .poll(async () =>
      Math.round(await header.evaluate((element) => element.getBoundingClientRect().width)),
    )
    .toBeGreaterThanOrEqual(359);
  expect(await page.evaluate((key) => localStorage.getItem(key), LEGACY_WIDTHS_KEY)).toBeNull();

  const handle = header.getByRole("separator");
  // 下限是这一列自己声明的（放得下掩码后的密钥），不是表格默认的最小列宽。
  const minDesignWidth = Number(await handle.getAttribute("aria-valuemin"));
  expect(minDesignWidth).toBeGreaterThan(0);
  const dragStart = await handle.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });

  await page.mouse.move(dragStart.x, dragStart.y);
  await page.mouse.down();
  await page.mouse.move(dragStart.x - 640, dragStart.y, { steps: 10 });

  // 拖宽是实时的：列本身就在变窄，拖过下限就停在下限，参考线贴着列的右缘。
  const during = await page.evaluate(() => {
    const headerElement = document.querySelector<HTMLElement>('th[data-col="key"]');
    const guide = document.querySelector<HTMLElement>("[data-grid-resize-guide]");
    if (!headerElement || !guide) throw new Error("Missing resize state");
    const scale = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) / 16;
    const headerRect = headerElement.getBoundingClientRect();
    const guideRect = guide.getBoundingClientRect();
    return {
      headerWidth: headerRect.width,
      headerRight: headerRect.right,
      guideCenter: guideRect.left + guideRect.width / 2,
      scale,
    };
  });
  expect(during.headerWidth).toBeGreaterThanOrEqual(minDesignWidth * during.scale - 1);
  expect(during.headerWidth).toBeLessThanOrEqual(minDesignWidth * during.scale + 1);
  expect(Math.abs(during.guideCenter - during.headerRight)).toBeLessThanOrEqual(2);

  await page.mouse.up();

  await expect
    .poll(async () =>
      page.evaluate((key) => {
        const prefs = JSON.parse(localStorage.getItem(key) ?? "{}") as {
          widths?: Record<string, unknown>;
        };
        const width = prefs.widths?.key;
        return typeof width === "number" ? Math.round(width) : null;
      }, GRID_PREFS_KEY),
    )
    .toBe(minDesignWidth);
});

test("API Keys: the resize guide does not paint over the pinned action column", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1360, height: 980 });
  await setAuthed(page);
  await mockOwnedApiKeysApis(page);
  await openApiKeys(page);

  // 滚到最右：最后一列（创建时间）的右缘正好贴着操作列，拖宽把手在中间可滚动的那一段里。
  const scrolled = await scrollGridTo(page, "end");
  expect(scrolled.max).toBeGreaterThan(0);

  const handle = page.locator('th[data-col="created"]').getByRole("separator");
  const dragStart = await handle.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const actionsRect = document
      .querySelector<HTMLElement>('th[data-col="actions"]')
      ?.getBoundingClientRect();
    if (!actionsRect) throw new Error("Missing actions header");
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      actionsLeft: actionsRect.left,
    };
  });

  // 往右拖进冻结的操作列底下：列的右缘滚到了操作列下面，那里看不到列边，参考线画上去会压在
  // 操作列上、像是在拖操作列；宽度角标照常显示，收在中间可滚动的那一段里。
  await page.mouse.move(dragStart.x, dragStart.y);
  await page.mouse.down();
  await page.mouse.move(dragStart.actionsLeft + 80, dragStart.y, { steps: 8 });

  const state = await page.evaluate(() => {
    const viewport = document.querySelector<HTMLElement>(".sn-tbl-sc");
    const columnHeader = document.querySelector<HTMLElement>('th[data-col="created"]');
    const actionsHeader = document.querySelector<HTMLElement>('th[data-col="actions"]');
    if (!viewport || !columnHeader || !actionsHeader) throw new Error("Missing resize geometry");
    const visibleRect = (element: HTMLElement | null) => {
      if (!element) return null;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const shown =
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number(style.opacity) > 0 &&
        rect.width > 0 &&
        rect.height > 0;
      return shown ? rect : null;
    };
    const guide = visibleRect(document.querySelector<HTMLElement>("[data-grid-resize-guide]"));
    const badgeElement = document.querySelector<HTMLElement>("[data-grid-resize-badge]");
    const badge = visibleRect(badgeElement);
    const actionsRect = actionsHeader.getBoundingClientRect();
    return {
      columnRight: columnHeader.getBoundingClientRect().right,
      viewportLeft: viewport.getBoundingClientRect().left,
      actionsLeft: actionsRect.left,
      actionsRight: actionsRect.right,
      guideLeft: guide ? guide.left : null,
      guideRight: guide ? guide.right : null,
      badgeLeft: badge ? badge.left : null,
      badgeRight: badge ? badge.right : null,
      badgeText: badgeElement?.textContent ?? "",
    };
  });

  await page.mouse.up();

  // 前提：列的右缘确实已经拖到了操作列底下。
  expect(state.columnRight).toBeGreaterThan(state.actionsLeft + 1);
  // 参考线不画在操作列上。
  const guideOverActions =
    state.guideLeft !== null &&
    state.guideRight !== null &&
    state.guideRight > state.actionsLeft + 1 &&
    state.guideLeft < state.actionsRight - 1;
  expect(guideOverActions).toBe(false);
  // 角标仍然可见，整个落在操作列左侧（这张表左边没有冻结列，中间那一段从视口左缘开始），
  // 拖到哪里都读得到当前宽度。
  expect(state.badgeLeft).not.toBeNull();
  expect(state.badgeRight).not.toBeNull();
  expect(state.badgeRight ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(state.actionsLeft + 1);
  expect(state.badgeLeft ?? Number.NEGATIVE_INFINITY).toBeGreaterThanOrEqual(
    state.viewportLeft - 1,
  );
  expect(state.badgeText).toMatch(/\d+/);
});

test("API Keys: the pinned action column does not cover the last column at the right edge", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1360, height: 980 });
  await setAuthed(page);
  await mockOwnedApiKeysApis(page);
  await openApiKeys(page);

  const states: EndPinnedGeometry[] = [];
  for (const where of ["start", "middle", "end"] as const) {
    await scrollGridTo(page, where);
    // 阴影有 180ms 的淡入淡出，等它落定再读。
    await page.waitForTimeout(260);
    states.push(await readEndPinnedGeometry(page));
  }

  for (const state of states) {
    expectActionsHugTheRightEdge(state);
  }

  const [atStart, atMiddle, atEnd] = states;
  expect(atStart?.maxScrollLeft).toBeGreaterThan(0);
  expect(atStart?.scrollLeft).toBe(0);
  // 右侧阴影在滚到终点前一直在，到了终点收起。
  expect(atStart?.endShadow).toBe("1");
  expect(atMiddle?.endShadow).toBe("1");
  expect(atEnd?.endShadow).toBe("0");
  expect(atEnd?.scrollLeft).toBe(atEnd?.maxScrollLeft);
  // 滚到最右，最后一列（创建时间）整列落在操作列左边，没有被冻结的操作列盖住。
  expect(atEnd?.lastColumnRight).toBeLessThanOrEqual((atEnd?.actionsLeft ?? 0) + 1);
  expect(atEnd?.lastColumnHit).toBe("created");
});

test("API Keys: the pinned action column stays put while dragging the horizontal scrollbar", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1360, height: 980 });
  await setAuthed(page);
  await mockOwnedApiKeysApis(page);
  await openApiKeys(page);

  // Satin 原生横向悬浮滚动条（.sn-sa-bar.sn-x）叠在视口外。
  await page.locator(".sn-tbl-wrap > .sn-sa").first().hover();
  const thumb = page.locator(".sn-tbl-wrap > .sn-sa > .sn-sa-bar.sn-x .sn-sa-thumb").first();
  await thumb.waitFor({ state: "visible" });
  const dragStart = await thumb.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });

  await page.mouse.move(dragStart.x, dragStart.y);
  await page.mouse.down();
  await page.mouse.move(dragStart.x + 120, dragStart.y, { steps: 12 });
  await page.waitForTimeout(260);

  const thumbDragging = await page.evaluate(
    () =>
      document.querySelector(".sn-tbl-wrap > .sn-sa > .sn-sa-bar.sn-x")?.classList.contains("sn-drag") ??
      false,
  );
  const state = await readEndPinnedGeometry(page);

  await page.mouse.up();

  expect(thumbDragging).toBe(true);
  expect(state.scrollLeft).toBeGreaterThan(0);
  expect(state.scrollLeft).toBeLessThan(state.maxScrollLeft);
  // 中途右侧阴影在：右边还有没滚到的列。
  expect(state.endShadow).toBe("1");
  expectActionsHugTheRightEdge(state);
  // 冻结格不画竖线（分隔靠阴影），也没有旧表格那层冻结轨道。
  expect(state.actionsHeaderBorderLeft).toBe("0px");
  expect(state.actionsCellBorderLeft).toBe("0px");
});

test("Portal Accounts: dark hover keeps the start-pinned columns opaque above scrolled content", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1360, height: 980 });
  await setAuthed(page, { dark: true });
  await mockPortalAccountsApis(page);
  await openPortalAccounts(page);

  const scrolled = await scrollGridTo(page, "middle");
  expect(scrolled.scrollLeft).toBeGreaterThan(0);

  const accountCell = page.locator('tr[data-row-key] td[data-col="account"]').first();
  const hoverPoint = await accountCell.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.left + Math.min(24, rect.width / 2), y: rect.top + rect.height / 2 };
  });
  await page.mouse.move(hoverPoint.x, hoverPoint.y);

  const state = await page.evaluate(() => {
    const row = document.querySelector<HTMLElement>("tr[data-row-key]");
    // 表格自己的勾选列：行首第一格，冻结在左、没有列 id。
    const selectCell = row?.querySelector<HTMLElement>('td[data-pin="start"]:not([data-col])');
    const accountCellElement = row?.querySelector<HTMLElement>('td[data-col="account"]');
    if (!row || !selectCell || !accountCellElement) {
      throw new Error("Missing dark hover table cells");
    }

    const alphaOf = (element: HTMLElement) => {
      const backgroundColor = getComputedStyle(element).backgroundColor;
      const slashAlpha = backgroundColor.match(/\/\s*([0-9.]+%?)\s*\)?$/)?.[1];
      const commaAlpha = backgroundColor.startsWith("rgba(")
        ? backgroundColor.slice(5, -1).split(",").at(3)?.trim()
        : undefined;
      const rawAlpha = slashAlpha ?? commaAlpha;
      const alpha = rawAlpha?.endsWith("%")
        ? Number(rawAlpha.slice(0, -1)) / 100
        : Number(rawAlpha ?? 1);
      return Number.isFinite(alpha) ? alpha : 1;
    };

    const accountRect = accountCellElement.getBoundingClientRect();
    const accountHit = document.elementFromPoint(
      accountRect.left + Math.min(24, accountRect.width / 2),
      accountRect.top + accountRect.height / 2,
    );

    return {
      isDark: document.documentElement.classList.contains("dark"),
      rowHovered: row.matches(":hover"),
      selectAlpha: alphaOf(selectCell),
      accountAlpha: alphaOf(accountCellElement),
      selectPosition: getComputedStyle(selectCell).position,
      accountPosition: getComputedStyle(accountCellElement).position,
      accountHitColumn: accountHit?.closest<HTMLElement>("td[data-col]")?.dataset.col ?? null,
    };
  });

  expect(state.isDark).toBe(true);
  expect(state.rowHovered).toBe(true);
  // 悬停色也必须是不透明的：冻结格盖在滚动内容上，半透明会透出底下滚过去的列。
  expect(state.selectAlpha).toBe(1);
  expect(state.accountAlpha).toBe(1);
  expect(state.selectPosition).toBe("sticky");
  expect(state.accountPosition).toBe("sticky");
  expect(state.accountHitColumn).toBe("account");
});

test("Portal Accounts: the start-pinned columns stay at the left edge while scrolling", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1360, height: 980 });
  await setAuthed(page);
  await mockPortalAccountsApis(page);
  await openPortalAccounts(page);

  const read = () =>
    page.evaluate(() => {
      const root = document.querySelector<HTMLElement>(".sn-tbl-wrap");
      const viewport = document.querySelector<HTMLElement>(".sn-tbl-sc");
      const row = document.querySelector<HTMLElement>("tr[data-row-key]");
      const selectHeader = document.querySelector<HTMLElement>(
        'thead th[data-pin="start"]:not([data-col])',
      );
      const accountHeader = document.querySelector<HTMLElement>('th[data-col="account"]');
      const selectCell = row?.querySelector<HTMLElement>('td[data-pin="start"]:not([data-col])');
      const accountCell = row?.querySelector<HTMLElement>('td[data-col="account"]');
      if (!root || !viewport || !selectHeader || !accountHeader || !selectCell || !accountCell) {
        throw new Error("Missing start-pinned geometry");
      }
      const rect = (element: HTMLElement) => element.getBoundingClientRect();
      const hit = (element: HTMLElement) => {
        const box = rect(element);
        return (
          document
            .elementFromPoint(box.right - 8, box.top + box.height / 2)
            ?.closest<HTMLElement>("[data-col]")?.dataset.col ?? null
        );
      };
      const rootStyle = getComputedStyle(root);
      return {
        scrollLeft: viewport.scrollLeft,
        maxScrollLeft: viewport.scrollWidth - viewport.clientWidth,
        viewportLeft: rect(viewport).left,
        selectHeaderLeft: rect(selectHeader).left,
        selectHeaderWidth: rect(selectHeader).width,
        selectCellLeft: rect(selectCell).left,
        selectCellWidth: rect(selectCell).width,
        accountHeaderLeft: rect(accountHeader).left,
        accountHeaderRight: rect(accountHeader).right,
        accountCellLeft: rect(accountCell).left,
        accountCellRight: rect(accountCell).right,
        accountHeaderHit: hit(accountHeader),
        accountCellHit: hit(accountCell),
        startShadow: getComputedStyle(accountCell, "::after").opacity,
        accountHeaderBorderRight: getComputedStyle(accountHeader).borderRightWidth,
        accountCellBorderRight: getComputedStyle(accountCell).borderRightWidth,
        frameRadius: Number.parseFloat(rootStyle.borderTopLeftRadius),
        frameClips: rootStyle.overflow === "hidden",
      };
    });

  const states = [];
  for (const where of ["start", "middle", "end"] as const) {
    await scrollGridTo(page, where);
    // 阴影有 180ms 的淡入淡出，等它落定再读。
    await page.waitForTimeout(260);
    states.push(await read());
  }

  for (const state of states) {
    // 勾选列贴住视口左缘，「账号」紧挨着它；表头和单元格同一条边。
    expect(state.selectHeaderLeft).toBeGreaterThanOrEqual(state.viewportLeft - 1);
    expect(state.selectHeaderLeft).toBeLessThanOrEqual(state.viewportLeft + 1);
    expect(state.selectCellLeft).toBeGreaterThanOrEqual(state.viewportLeft - 1);
    expect(state.selectCellLeft).toBeLessThanOrEqual(state.viewportLeft + 1);
    expect(state.accountHeaderLeft).toBeGreaterThanOrEqual(
      state.viewportLeft + state.selectHeaderWidth - 1,
    );
    expect(state.accountHeaderLeft).toBeLessThanOrEqual(
      state.viewportLeft + state.selectHeaderWidth + 1,
    );
    expect(state.accountCellLeft).toBeGreaterThanOrEqual(
      state.viewportLeft + state.selectCellWidth - 1,
    );
    expect(state.accountCellLeft).toBeLessThanOrEqual(
      state.viewportLeft + state.selectCellWidth + 1,
    );
    expect(Math.abs(state.accountCellRight - state.accountHeaderRight)).toBeLessThanOrEqual(1);
    // 冻结区最右的一个像素仍属于「账号」：滚过去的列钻不到它上面。
    expect(state.accountHeaderHit).toBe("account");
    expect(state.accountCellHit).toBe("account");
    // 冻结格不画竖线（分隔靠阴影）。
    expect(state.accountHeaderBorderRight).toBe("0px");
    expect(state.accountCellBorderRight).toBe("0px");
    // 外框四角圆润，并把冻结格、表头底色裁在里面（不再是旧表格单独画的表头圆角底板）。
    expect(state.frameRadius).toBeGreaterThan(0);
    expect(state.frameClips).toBe(true);
  }

  const [atStart, atMiddle, atEnd] = states;
  expect(atStart?.maxScrollLeft).toBeGreaterThan(0);
  // 左侧阴影只在离开起点后出现。
  expect(atStart?.scrollLeft).toBe(0);
  expect(atStart?.startShadow).toBe("0");
  expect(atMiddle?.startShadow).toBe("1");
  expect(atEnd?.startShadow).toBe("1");
  expect(atEnd?.scrollLeft).toBe(atEnd?.maxScrollLeft);
});

test("Portal Accounts: the pinned account column carries its edge with it while resizing", async ({
  page,
}) => {
  await page.setViewportSize({ width: 2048, height: 1180 });
  await setAuthed(page);
  await mockPortalAccountsApis(page);
  await openPortalAccounts(page);

  const header = page.locator('th[data-col="account"]');
  const before = await header.evaluate((element) => element.getBoundingClientRect().width);
  const handle = header.getByRole("separator");
  const dragStart = await handle.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });

  await page.mouse.move(dragStart.x, dragStart.y);
  await page.mouse.down();
  // 账号列最宽 480 设计像素：拖 150px 还在上限之内。
  await page.mouse.move(dragStart.x + 150, dragStart.y, { steps: 12 });

  const state = await page.evaluate(() => {
    const accountHeader = document.querySelector<HTMLElement>('th[data-col="account"]');
    const accountCell = document.querySelector<HTMLElement>('td[data-col="account"]');
    const selectCell = document.querySelector<HTMLElement>(
      'tr[data-row-key] > td[data-pin="start"]:not([data-col])',
    );
    if (!accountHeader || !accountCell || !selectCell) {
      throw new Error("Missing fixed-column resize geometry");
    }
    const accountHeaderRect = accountHeader.getBoundingClientRect();
    const accountCellRect = accountCell.getBoundingClientRect();
    const edge = getComputedStyle(accountCell, "::after");
    return {
      accountHeaderRight: accountHeaderRect.right,
      accountHeaderWidth: accountHeaderRect.width,
      accountCellRight: accountCellRect.right,
      accountCellWidth: accountCellRect.width,
      accountHeaderEdge: accountHeader.classList.contains("sn-pin-l-end"),
      accountCellEdge: accountCell.classList.contains("sn-pin-l-end"),
      selectCellEdge: selectCell.classList.contains("sn-pin-l-end"),
      edgeRight: edge.right,
      edgeWidth: edge.width,
      edgeShadow: edge.boxShadow,
    };
  });

  await page.mouse.up();

  // 冻结的账号列整列跟着变宽：表头和每一行同宽、右缘对齐；冻结区的边缘（1px 细线 + 柔雾投影）挂在账号列上，
  // 跟着它走，不停在勾选列后面。
  expect(state.accountHeaderWidth).toBeGreaterThanOrEqual(before + 148);
  expect(Math.abs(state.accountCellWidth - state.accountHeaderWidth)).toBeLessThanOrEqual(1);
  expect(Math.abs(state.accountCellRight - state.accountHeaderRight)).toBeLessThanOrEqual(1);
  expect(state.accountHeaderEdge).toBe(true);
  expect(state.accountCellEdge).toBe(true);
  expect(state.selectCellEdge).toBe(false);
  expect(state.edgeRight).toBe("0px");
  expect(state.edgeWidth).toBe(PIN_EDGE_WIDTH);
  expect(state.edgeShadow).not.toBe("none");
});
