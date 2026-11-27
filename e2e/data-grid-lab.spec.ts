import { expect, test, type Page } from "@playwright/test";
import { openEmptyAdminPage } from "./fixtures/emptyAdminPage";

/**
 * 新表格演示页（计划 104，只在开发环境注册）的几何稳定性：
 * 筛选、加载前后，筛选区、表头、分页、表格外框的位置和尺寸都不能变（容差 1px）；
 * PC 横屏下整张表连分页都落在窗口内，分页条自身不横向溢出。
 * 页面只用本地假数据，管理端接口由 openEmptyAdminPage 统一拦成空响应。
 */

const PARTS = {
  filterArea: '[role="search"]',
  header: ".sn-tbl-wrap thead",
  pagination: 'nav[aria-label="分页"]',
  frame: ".sn-tbl-wrap",
} as const;

type Rects = Record<keyof typeof PARTS, { x: number; y: number; width: number; height: number }>;

async function openLab(page: Page) {
  await openEmptyAdminPage(page, "/lab/data-grid");
  await expect(page.locator("tr[data-row-key]").first()).toBeVisible({ timeout: 15_000 });
  // 首屏数据到达后的入场动画走完
  await page.waitForTimeout(400);
}

/**
 * 在页面里每个动画帧记一次各部件的位置和尺寸，持续 durationMs，返回每个部件相对第一帧的最大偏差。
 * 逐帧采样比只在前后各截一次更严：中途跳一下再回来也会被抓到。
 */
async function sampleDrift(page: Page, action: () => Promise<void>, durationMs = 1400) {
  await page.evaluate(
    ({ parts, durationMs }) => {
      const read = () =>
        Object.fromEntries(
          Object.entries(parts).map(([key, selector]) => {
            const element = document.querySelector(selector);
            const rect = element?.getBoundingClientRect();
            return [
              key,
              rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
            ];
          }),
        );
      const samples: unknown[] = [read()];
      const end = performance.now() + durationMs;
      const tick = () => {
        samples.push(read());
        if (performance.now() < end) requestAnimationFrame(tick);
        else (window as unknown as { __gridSamples: unknown[] }).__gridSamples = samples;
      };
      (window as unknown as { __gridSamples: unknown[] | null }).__gridSamples = null;
      requestAnimationFrame(tick);
    },
    { parts: PARTS, durationMs },
  );
  await action();
  const samples = (await page
    .waitForFunction(
      () => (window as unknown as { __gridSamples: unknown[] | null }).__gridSamples,
      undefined,
      { timeout: durationMs + 5_000 },
    )
    .then((handle) => handle.jsonValue())) as Rects[];
  const first = samples[0];
  const drift: Record<string, number> = {};
  for (const key of Object.keys(PARTS) as (keyof typeof PARTS)[]) {
    drift[key] = Math.max(
      ...samples.map((sample) =>
        Math.max(
          Math.abs(sample[key].x - first[key].x),
          Math.abs(sample[key].y - first[key].y),
          Math.abs(sample[key].width - first[key].width),
          Math.abs(sample[key].height - first[key].height),
        ),
      ),
    );
  }
  return { drift, frames: samples.length };
}

test.describe("data grid lab", () => {
  test("筛选与加载时筛选区、表头、分页、外框都不跳动、不变形", async ({ page }) => {
    await page.setViewportSize({ width: 1470, height: 800 });
    await openLab(page);

    // 状态页签切到「失败」：条数、芯片、表体都在变，周围的框不能动
    const tabs = page.getByRole("tablist", { name: "按状态查看" });
    const byTab = await sampleDrift(page, () => tabs.getByRole("tab", { name: /失败/ }).click());
    expect(byTab.frames).toBeGreaterThan(10);
    for (const [part, value] of Object.entries(byTab.drift)) {
      expect.soft(value, `${part} 在切换状态页签时偏移`).toBeLessThanOrEqual(1);
    }

    // 再用分面按钮筛模型：按钮从箭头换成个数徽标，宽度不变
    const facet = page.getByRole("search").getByRole("button", { name: /^模型/ });
    const facetBefore = await facet.boundingBox();
    await facet.click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("checkbox").nth(0).check();
    await dialog.getByRole("checkbox").nth(1).check();
    const byFacet = await sampleDrift(page, () =>
      dialog.getByRole("button", { name: "应用" }).click(),
    );
    for (const [part, value] of Object.entries(byFacet.drift)) {
      expect.soft(value, `${part} 在应用分面筛选时偏移`).toBeLessThanOrEqual(1);
    }
    const facetAfter = await facet.boundingBox();
    expect(Math.abs((facetAfter?.width ?? 0) - (facetBefore?.width ?? 0))).toBeLessThanOrEqual(1);

    // 清除全部：回到无筛选
    const byClear = await sampleDrift(page, () =>
      page.getByRole("button", { name: "清除全部" }).click(),
    );
    for (const [part, value] of Object.entries(byClear.drift)) {
      expect.soft(value, `${part} 在清除筛选时偏移`).toBeLessThanOrEqual(1);
    }
  });

  test("三种空状态与有数据时同高，并在表体居中", async ({ page }) => {
    await page.setViewportSize({ width: 1470, height: 800 });
    await openLab(page);
    const frame = page.locator(".sn-tbl-wrap");
    const withRows = await frame.boundingBox();

    const states = page.getByRole("radiogroup", { name: "演示状态" });
    await states.getByRole("radio", { name: "无数据" }).click();
    await expect(page.getByText("还没有请求日志")).toBeVisible();
    expect((await frame.boundingBox())?.height).toBeCloseTo(withRows?.height ?? 0, 0);

    await states.getByRole("radio", { name: "无匹配" }).click();
    await expect(page.getByText("没有符合条件的请求")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole("list", { name: "生效的筛选条件" })).toContainText("耗时");
    await expect(page.getByRole("button", { name: "清除筛选" })).toBeVisible();
    expect((await frame.boundingBox())?.height).toBeCloseTo(withRows?.height ?? 0, 0);

    await states.getByRole("radio", { name: "出错" }).click();
    await expect(page.getByRole("alert")).toContainText("加载失败");
    await expect(page.getByRole("button", { name: "重试" })).toBeVisible();
    expect((await frame.boundingBox())?.height).toBeCloseTo(withRows?.height ?? 0, 0);
  });

  for (const size of [
    { width: 1280, height: 720 },
    { width: 1366, height: 768 },
    { width: 1470, height: 800 },
    { width: 1920, height: 1080 },
  ]) {
    test(`${size.width}×${size.height}：整张表连分页都在窗口内，分页不横向溢出`, async ({
      page,
    }) => {
      await page.setViewportSize(size);
      await openLab(page);
      const pagination = page.locator(PARTS.pagination);
      const box = await pagination.boundingBox();
      expect(box).not.toBeNull();
      expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(size.height);
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(size.width);
      const overflow = await pagination.evaluate((element) => ({
        scroll: element.scrollWidth - element.clientWidth,
        page: document.documentElement.scrollHeight - window.innerHeight,
      }));
      expect(overflow.scroll).toBeLessThanOrEqual(1);
      // 页面本身不滚动：表体在自己的框里滚
      expect(overflow.page).toBeLessThanOrEqual(1);
      const frame = await page.locator(PARTS.frame).boundingBox();
      expect((frame?.y ?? 0) + (frame?.height ?? 0)).toBeLessThanOrEqual(size.height);
    });
  }
});
