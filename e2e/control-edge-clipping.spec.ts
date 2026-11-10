import { expect, test } from "@playwright/test";
import { ADMIN_PAGE_ROUTES, openEmptyAdminPage } from "./fixtures/emptyAdminPage";

/**
 * 控件的描边不许被容器裁掉。
 *
 * 按钮、输入框的轮廓是画在盒子外面的一条 1px 阴影线（shadow-control 的 `0 0 0 1px`），不占布局。
 * 控件只要贴住一个会裁剪的祖先（overflow 不是 visible，或挂着 mask）的边，那一侧的线就画不出来：
 * 2026-11-09 出站代理页的「刷新」按钮贴着页面根（md:overflow-hidden）的上沿，整条顶边消失，
 * 只剩两个上角淡出去的一截弧线。实心按钮没有这条线，所以只有描边按钮露馅。
 *
 * 键盘焦点框（全局 :focus-visible，2px 描边 + 2px 偏移）同样画在盒外，所以带描边的控件四周要留出
 * 4px 才算安全：贴边的容器用「负外边距 + 等量内边距」（-m-1 p-1 一类）把裁剪框往外让，版面不变。
 *
 * 逐页在空数据下检查：控件本身完整落在裁剪框里，外扩的 4px 却越过了裁剪框。控件盒子本身越界的
 * 是被滚出视野的内容，属于正常滚动，不算。
 */

/** 盒外要留的空间：1px 描边，以及焦点框的 2px 描边 + 2px 偏移。 */
const OUTSIDE_ROOM_PX = 4;

const CONTROLS = [
  "button",
  "a[href]",
  "input:not([type=hidden])",
  "select",
  "textarea",
  "[role=button]",
  "[role=tab]",
  "[role=switch]",
  "[role=combobox]",
  "[role=checkbox]",
  "[role=radio]",
].join(",");

const findClippedOutlines = ([selector, room]: [string, number]): string[] => {
  // 外描边：不内嵌、无偏移、无模糊、扩散大于 0 的那层阴影，就是那条线。
  const outlineWidth = (shadow: string) => {
    if (!shadow || shadow === "none") return 0;
    let width = 0;
    for (const part of shadow.split(/,(?![^(]*\))/)) {
      if (/\binset\b/.test(part)) continue;
      const lengths = [...part.matchAll(/(-?[\d.]+)px/g)].map((match) => parseFloat(match[1]));
      if (lengths.length < 4) continue;
      const [x, y, blur, spread] = lengths;
      if (x === 0 && y === 0 && blur === 0 && spread > 0) width = Math.max(width, spread);
    }
    return width;
  };
  const name = (el: Element) => {
    const label =
      el.getAttribute("aria-label") ||
      (el as HTMLElement).innerText ||
      el.getAttribute("placeholder") ||
      el.getAttribute("title") ||
      "";
    return `${el.tagName.toLowerCase()}「${label.trim().replace(/\s+/g, " ").slice(0, 24)}」`;
  };
  const boxName = (el: Element) =>
    [el.tagName.toLowerCase(), ...(el.getAttribute("class") ?? "").trim().split(/\s+/).slice(0, 8)]
      .filter(Boolean)
      .join(".");
  const eps = 0.5;
  const found: string[] = [];
  for (const el of document.querySelectorAll<HTMLElement>(selector)) {
    if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) continue;
    const ring = outlineWidth(getComputedStyle(el).boxShadow);
    if (ring <= 0) continue;
    const need = Math.max(ring, room);
    for (let box = el.parentElement; box && box !== document.body; box = box.parentElement) {
      const style = getComputedStyle(box);
      const clipsX = style.overflowX !== "visible";
      const clipsY = style.overflowY !== "visible";
      const mask = style.maskImage || style.getPropertyValue("-webkit-mask-image");
      const masked = Boolean(mask) && mask !== "none";
      if (!clipsX && !clipsY && !masked) continue;
      // overflow 裁到内边距盒（去掉边框），mask 裁到边框盒；两者都有时取更紧的内边距盒。
      const border = (side: "Top" | "Right" | "Bottom" | "Left") =>
        clipsX || clipsY ? parseFloat(style[`border${side}Width`]) || 0 : 0;
      const outer = box.getBoundingClientRect();
      const clip = {
        top: outer.top + border("Top"),
        right: outer.right - border("Right"),
        bottom: outer.bottom - border("Bottom"),
        left: outer.left + border("Left"),
      };
      const outside =
        rect.top < clip.top - eps ||
        rect.bottom > clip.bottom + eps ||
        rect.left < clip.left - eps ||
        rect.right > clip.right + eps;
      if (outside) break;
      const vertical = clipsY || masked;
      const horizontal = clipsX || masked;
      const sides = [
        vertical && rect.top - need < clip.top - eps ? "上" : "",
        vertical && rect.bottom + need > clip.bottom + eps ? "下" : "",
        horizontal && rect.left - need < clip.left - eps ? "左" : "",
        horizontal && rect.right + need > clip.right + eps ? "右" : "",
      ].filter(Boolean);
      if (sides.length > 0) {
        found.push(`${name(el)} 的${sides.join("、")}边被 ${boxName(box)} 裁掉`);
        break;
      }
    }
  }
  return found;
};

// 宽屏和 lg 断点下各量一次：窄一些时页头换行、工具栏折行，贴边的控件会换一批。
const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
] as const;

test.describe("控件描边不被裁剪", () => {
  for (const viewport of VIEWPORTS) {
    for (const route of ADMIN_PAGE_ROUTES) {
      test(`${route} @ ${viewport.width}×${viewport.height}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await openEmptyAdminPage(page, route);
        // 入场动画（Reveal 的位移）结束后再量：动画中途的位置不是页面真正的版面。
        await page.waitForFunction(() =>
          document.getAnimations().every((animation) => {
            const end = animation.effect?.getComputedTiming().endTime;
            return animation.playState !== "running" || end === Infinity;
          }),
        );
        expect(
          await page.evaluate(findClippedOutlines, [CONTROLS, OUTSIDE_ROOM_PX] as [string, number]),
        ).toEqual([]);
      });
    }
  }
});

/*
 * 配置页的分区胶囊栏是横向滚动区。默认选中的第一颗是实心底色、没有描边，空页面上查不出问题；
 * 选中别的分区后它换回描边样式，贴着滚动栏左沿，左边那条线就被裁掉了（2026-11-09）。
 */
test("配置页选中别的分区后，胶囊描边仍完整", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEmptyAdminPage(page, "/system/config");
  const chips = page.locator("nav .scrollbar-hidden.overflow-x-auto > button");
  await chips.nth(1).click();
  await expect(chips.nth(1)).toHaveAttribute("aria-current", "true");
  await expect
    .poll(() => page.evaluate(findClippedOutlines, [CONTROLS, OUTSIDE_ROOM_PX] as [string, number]))
    .toEqual([]);
});
