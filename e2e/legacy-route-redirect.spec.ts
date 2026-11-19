import { expect, test, type Page } from "@playwright/test";
import { mockEmptyAdminApi } from "./fixtures/emptyAdminPage";

/**
 * 打开旧地址、站内切到还没加载过代码的页面时，逐帧（requestAnimationFrame）检查画面，不许出现整屏空白。
 *
 * 11-18 发现：打开旧地址 /auth-files 跳 AI 账号页时整屏白约 0.3 秒。旧地址那时是外壳里的一个
 * <Navigate> 页面，一挂上就撤掉了首屏加载层；页面切换动画（AnimatePresence mode="wait"）在旧页面
 * 退场后、导航的 transition 之外才挂载目标页，目标页的代码这时才开始加载、一挂起，包着整个外壳的
 * Suspense 就换成了空回退——加载层淡出后，屏幕上只剩底色，直到代码加载完。
 */

type Frame = {
  t: number;
  url: string;
  /** 首屏加载层的不透明度；不在文档里时为 null。 */
  loader: number | null;
  /** 侧边栏、顶栏、内容区都画在屏幕上。 */
  shell: boolean;
  /** 内容区里已经挂上了页面（不是空的页面包装层）。 */
  pageMounted: boolean;
};

const installFrameSampler = async (page: Page) => {
  await page.addInitScript(() => {
    const frames: Frame[] = [];
    (window as unknown as { __frames: Frame[] }).__frames = frames;
    const visible = (selector: string) => {
      const el = document.querySelector(selector);
      return Boolean(el?.checkVisibility({ opacityProperty: true, visibilityProperty: true }));
    };
    const sample = () => {
      const loader = document.getElementById("app-loader");
      frames.push({
        t: Math.round(performance.now()),
        url: `${location.pathname}${location.hash}`,
        loader: loader ? Number(getComputedStyle(loader).opacity) : null,
        shell: visible("#root aside") && visible("#root header") && visible("#main-content"),
        pageMounted: Boolean(
          document.getElementById("main-content")?.firstElementChild?.childElementCount,
        ),
      });
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
};

const readFrames = (page: Page) =>
  page.evaluate(() => (window as unknown as { __frames: Frame[] }).__frames.slice());

const resetFrames = (page: Page) =>
  page.evaluate(() => {
    (window as unknown as { __frames: Frame[] }).__frames.length = 0;
  });

const currentReveal = (page: Page) =>
  page.evaluateHandle(() => document.getElementById("main-content")?.firstElementChild ?? null);

/**
 * 等到加载层撤掉、落地页的入场动画走完，整段过程都已采样。站内切页时传入切页前的页面包装层：
 * 旧页面退场期间它还在，要等换成新的那一层。
 */
const waitForSettledPage = (page: Page, previousReveal: unknown = null) =>
  page.waitForFunction((previous) => {
    const reveal = document.getElementById("main-content")?.firstElementChild;
    return (
      !document.getElementById("app-loader") &&
      Boolean(reveal) &&
      reveal !== previous &&
      Boolean(reveal?.childElementCount) &&
      getComputedStyle(reveal as Element).opacity === "1"
    );
  }, previousReveal);

const describeFrame = (frame: Frame) =>
  `${frame.t}ms ${frame.url} loader=${frame.loader ?? "gone"} shell=${frame.shell} page=${frame.pageMounted}`;

/** 文档画出来之后（加载层或外壳出现过），每一帧要么加载层还盖着，要么外壳在屏幕上。 */
const expectNoBlankFrame = (frames: Frame[]) => {
  const start = frames.findIndex((frame) => frame.loader !== null || frame.shell);
  expect(start, "never saw the app loader or the shell").toBeGreaterThanOrEqual(0);
  const blank = frames
    .slice(start)
    .filter((frame) => (frame.loader === null || frame.loader < 0.05) && !frame.shell);
  expect(blank.map(describeFrame), `${frames.length - start} frames sampled`).toEqual([]);
};

/** 加载层开始淡出时，目标页已经挂在外壳里——不会淡出成一个空外壳再等页面。 */
const expectLoaderFadesIntoThePage = (frames: Frame[]) => {
  const fading = frames.filter((frame) => frame.loader !== null && frame.loader < 0.95);
  expect(fading.length, "the app loader never faded out").toBeGreaterThan(0);
  expect(fading.filter((frame) => !frame.shell || !frame.pageMounted).map(describeFrame)).toEqual(
    [],
  );
};

const expectOnPage = async (page: Page, path: RegExp, label: string) => {
  await expect(page).toHaveURL(path);
  await expect(page.locator("#root header")).toContainText(label);
  await expect(page.locator('#root aside a[aria-current="page"]')).toHaveText(label);
};

test.beforeEach(async ({ page }) => {
  await mockEmptyAdminApi(page);
  await installFrameSampler(page);
});

const LEGACY_ADDRESSES = [
  { from: "/auth-files", to: /#\/access\/ai-accounts$/, label: "AI 账号" },
  { from: "/identity-fingerprint", to: /#\/access\/ai-accounts$/, label: "AI 账号" },
  { from: "/access/api-keys", to: /#\/access\/end-users$/, label: "门户账号" },
];

for (const legacy of LEGACY_ADDRESSES) {
  test(`opening the legacy address ${legacy.from} lands on its page without a blank frame`, async ({
    page,
  }) => {
    await page.goto(`/#${legacy.from}`);
    await waitForSettledPage(page);
    await expectOnPage(page, legacy.to, legacy.label);

    const frames = await readFrames(page);
    expectNoBlankFrame(frames);
    expectLoaderFadesIntoThePage(frames);
  });
}

test("opening /manage/auth-files through the production entry (BrowserRouter) does not blank either", async ({
  page,
  baseURL,
}) => {
  // 线上 /manage/* 由 manage.html（BrowserRouter）接管；开发服务器只会回退到 index.html（HashRouter），
  // 这里把文档请求换成开发服务器转换过的 manage.html。
  await page.route("**/manage/auth-files", async (route) => {
    if (route.request().resourceType() !== "document") return route.fallback();
    const response = await route.fetch({ url: `${baseURL}/manage/manage.html` });
    await route.fulfill({ response });
  });

  await page.goto("/manage/auth-files");
  await waitForSettledPage(page);
  await expectOnPage(page, /\/manage\/access\/ai-accounts$/, "AI 账号");

  const frames = await readFrames(page);
  expectNoBlankFrame(frames);
  expectLoaderFadesIntoThePage(frames);
});

test("following a legacy address from inside the panel keeps the shell on screen", async ({
  page,
}) => {
  await page.goto("/#/dashboard");
  await waitForSettledPage(page);

  // 不经侧边栏（侧边栏会先预加载代码）：地址栏、站内链接、浏览器前进后退都是这条路。
  const dashboardReveal = await currentReveal(page);
  await resetFrames(page);
  await page.evaluate(() => {
    location.hash = "#/auth-files";
  });
  await waitForSettledPage(page, dashboardReveal);
  await expectOnPage(page, /#\/access\/ai-accounts$/, "AI 账号");

  const frames = await readFrames(page);
  expect(frames.length).toBeGreaterThan(0);
  expect(
    frames.filter((frame) => !frame.shell).map(describeFrame),
    "the shell left the screen during the page switch",
  ).toEqual([]);
});
