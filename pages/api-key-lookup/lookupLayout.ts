import type { ApiKeyLookupTab } from "./components/LookupResultsToolbar";

/**
 * 门户页的两种高度模式。
 *
 * 默认随内容流动、整页（窗口）滚动，结果栏靠 sticky 留在顶部——使用统计这类长页面就是这样。
 * 请求日志和敏感词是「一张列表」：桌面宽度改成钉满一屏，列表最多占到剩余高度、在内部滚动，
 * 分页条和保存栏始终看得见；以前靠 h-[calc(100dvh-300px)] 这类手算高度钉住表格，行少时留下
 * 一大块空框，敏感词的分页条则要把整页滚到底才看得到。窄屏照样随内容流动。
 *
 * 隐私脱敏也钉满一屏，内容在标签自己的滚动区里滚：它的子标签栏吸顶、设置的保存栏钉在底部、
 * 「试一试」跟着滚，都靠 sticky；整页滚动时 sticky 不起作用（PageBackground 的 app 底色带着
 * overflow-hidden，它成了 sticky 的滚动容器，却从不滚动）。
 */
export const isPinnedLookupTab = (tab: ApiKeyLookupTab) => tab === "logs" || tab === "words" || tab === "privacy";

export function lookupShellClassName(showLanding: boolean, pinned: boolean): string {
  return [
    "relative min-h-dvh pt-14",
    showLanding ? "" : "bg-canvas",
    pinned && !showLanding ? "md:flex md:h-dvh md:flex-col" : "",
  ].join(" ");
}

export function lookupMainClassName(showLanding: boolean, pinned: boolean): string {
  if (showLanding) return "w-full";
  // flex 子项带 mx-auto 时不会被横向拉伸，要显式 w-full 才能撑到 max-w-screen-xl。
  return pinned
    ? "mx-auto flex w-full max-w-screen-xl flex-col gap-5 px-4 py-6 sm:px-6 md:min-h-0 md:flex-1"
    : "mx-auto max-w-screen-xl space-y-5 px-4 py-6 sm:px-6";
}
