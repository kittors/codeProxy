import { expect, test, type Page } from "@playwright/test";
import { openEmptyAdminPage } from "./fixtures/emptyAdminPage";

/**
 * 页面底部留白必须和其余三边一致。
 *
 * 外层 <main> 给了四边等距的内边距，所以只要页面内容撑满 main 的内容盒，底部看到的就正好
 * 是那一条内边距。撑不满时多出来的高度会全部堆在底部，视觉上就是「下面那条明显更宽」。
 *
 * 这里用空数据跑：内容最少、最容易撑不满，是最严格的一档。
 *
 * `/runtime/system` 是内容本来就短的信息页，最后一张卡按内容高度收束，不再把空卡片拉满视口。
 * 底部多出来的是页面背景而不是卡片内腔，所以不纳入「画出来的内容必须撑满」这条约束。
 *
 * 内容超过一屏的页面反过来查：滚到底以后，最后一块内容离滚动容器底边必须还留着那条内边距。
 * 以前外壳对所有页面一律钉高，长页面的内容溢出被钉死的页面根，<main> 的底部内边距停在
 * 一屏高的位置，滚到底内容紧贴底边——这条用例当时对溢出页面直接跳过，所以没抓到。
 */

const HUG_CONTENT_ROUTES = new Set(["/runtime/system"]);

const ROUTES = [
  "/dashboard",
  "/runtime/monitor",
  "/runtime/request-logs",
  "/runtime/logs",
  "/runtime/system",
  "/access/ai-providers",
  "/access/ai-accounts",
  "/access/end-users",
  "/access/api-key-permissions",
  "/access/content-moderation",
  "/access/ccswitch-import-settings",
  "/access/api-keys",
  "/models/catalog",
  "/models/channel-groups",
  "/models/proxies",
  "/governance/tenants",
  "/governance/users",
  "/governance/roles",
  "/governance/audit-logs",
  "/system/config",
  "/system/menu-management",
] as const;

const measure = (page: Page) =>
  page.evaluate(() => {
    const main = document.getElementById("main-content") as HTMLElement;
    const cs = getComputedStyle(main);
    const rect = main.getBoundingClientRect();
    const padBottom = parseFloat(cs.paddingBottom);
    const padLeft = parseFloat(cs.paddingLeft);

    /*
     * 量的必须是「用户看得见的那块内容」的底边，不是最外层包装层的底边。
     * 包装层（Reveal）撑满了不等于页面内容撑满了——它是透明的，内部内容矮一截时，
     * 用户照样看到底部多出一条留白。所以向下钻取，跳过没有可见表面（无背景、无边框、
     * 无阴影）的纯布局容器，直到找到真正画出东西的元素。
     *
     * 页面压平之后（2026-10，外壳内容区就是页面面板，表格页不再包一张大卡），底部不再有
     * 一张被拉满的卡片可量；滚动区（DataTable 的滚动容器、ScrollArea 的视口）也算作画出来的边界。
     *
     * 2026-11 起表格按行数收高（行少时不再被拉成一整屏的空框，分页条紧跟最后一行），钉高页的
     * 表格不一定延伸到底了；行多时它占满剩余高度、在内部滚动，所以也没有 #909 那种「滚轮不响应
     * 的死区」。钉高页改为检查页面根撑到底：高度链完整，表格才有一块确定的高度可以封顶。
     */
    const paints = (el: Element) => {
      if (el.matches("[data-scroll-area-viewport], [data-scrollbar-visibility]")) return true;
      const s = getComputedStyle(el);
      if (s.visibility === "hidden" || s.display === "none" || s.opacity === "0") return false;
      const bg = s.backgroundColor;
      const opaqueBg = bg !== "transparent" && !/rgba?\([^)]*,\s*0\s*\)$/.test(bg);
      // 只认元素「自己」画出来的东西：纯布局容器会被跳过，继续往下钻
      const ownsText = [...el.childNodes].some(
        (n) => n.nodeType === 3 && (n.textContent ?? "").trim().length > 0,
      );
      return (
        opaqueBg ||
        s.borderBottomWidth !== "0px" ||
        s.boxShadow !== "none" ||
        ownsText ||
        el.tagName === "IMG" ||
        el.tagName === "SVG" ||
        el.tagName === "CANVAS"
      );
    };

    const bottoms: number[] = [];
    const collect = (el: Element) => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && paints(el)) bottoms.push(r.bottom);
      for (const kid of el.children) collect(kid);
    };
    for (const kid of main.children) collect(kid);

    // 钉高页（data-page-fill）检查页面根是否撑到底——高度链完整，行多时表格才能占满剩余高度、
    // 在内部滚动。表格本身按行数收高，空数据时只有表头和一句空态，量它量不出高度链断没断。
    const root = main.firstElementChild?.firstElementChild as HTMLElement | null;
    const fillMode = root?.getAttribute("data-page-fill");
    const fillActive =
      fillMode === "always" ||
      (fillMode === "md" && window.matchMedia("(min-width: 48rem)").matches) ||
      (fillMode === "lg" && window.matchMedia("(min-width: 64rem)").matches);
    if (root && fillActive) bottoms.push(root.getBoundingClientRect().bottom);

    const contentBottom = bottoms.length ? Math.max(...bottoms) : rect.top;
    const scroller = main.parentElement as HTMLElement;
    return {
      // >0 表示内容没撑满，这部分会叠加在底部内边距之上
      gap: Math.round(rect.bottom - padBottom - contentBottom),
      padBottom: Math.round(padBottom),
      padLeft: Math.round(padLeft),
      overflow: Math.round(scroller.scrollHeight - scroller.clientHeight),
    };
  });

/** 外层滚到底后，最后一块画出来的内容离滚动容器底边还剩多少 */
const measureScrolledEnd = (page: Page) =>
  page.evaluate(() => {
    const main = document.getElementById("main-content") as HTMLElement;
    const scroller = main.parentElement as HTMLElement;
    scroller.scrollTop = scroller.scrollHeight;
    let lowest = Number.NEGATIVE_INFINITY;
    main.querySelectorAll("*").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      const s = getComputedStyle(el);
      if (s.visibility === "hidden" || s.display === "none") return;
      lowest = Math.max(lowest, r.bottom);
    });
    return Math.round(scroller.getBoundingClientRect().bottom - lowest);
  });

test.describe("页面底部留白", () => {
  for (const route of ROUTES) {
    test(`${route} 的底部留白等于左右内边距`, async ({ page }) => {
      await openEmptyAdminPage(page, route);

      /*
       * 轮询而不是固定 sleep：入场动画、懒加载 chunk、首屏请求各自落定的时间不一样，
       * 并发跑的时候更飘。固定等待要么不够（量到过渡中的高度，假失败），要么白等。
       * 布局真有问题时它会一直不达标，照样失败。
       */
      let last = await measure(page);
      await expect
        .poll(
          async () => {
            last = await measure(page);
            // 内容超过一屏时由外层滚动，底部不存在多余留白。
            // 短内容页按内容收束，不把最后一张卡拉满来制造假的「撑满」。
            return last.overflow > 1 || HUG_CONTENT_ROUTES.has(route) ? 0 : last.gap;
          },
          { timeout: 15_000 },
        )
        // 留 2px 给亚像素取整
        .toBeLessThanOrEqual(2);

      // 四边内边距本来就同源，这里顺带守住它不被单独改坏
      expect(
        last.padBottom,
        `底部留白 ${last.padBottom + last.gap}px，左右 ${last.padLeft}px`,
      ).toBe(last.padLeft);

      // 外层在滚的页面：滚到底以后内容不能贴着底边。同样轮询——卡片的入场动画带几像素
      // 位移，动画没走完时量到的底边会偏低。
      if (last.overflow > 1) {
        await expect
          .poll(() => measureScrolledEnd(page), {
            message: "滚到底后最后一块内容离底边的距离",
            timeout: 15_000,
          })
          .toBeGreaterThanOrEqual(last.padBottom - 2);
      }
    });
  }
});
