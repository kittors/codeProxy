import { useLocation, useOutlet } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { Reveal } from "@code-proxy/ui";
import { useOptionalAuth } from "@app/providers/AuthProvider";
import { AppShell } from "./AppShell";

export function DashboardLayout() {
  const location = useLocation();
  const outlet = useOutlet();
  const auth = useOptionalAuth();
  // Remount page content when the effective tenant changes so list/detail
  // data reloads under the new tenant header instead of keeping stale state.
  const tenantKey = auth?.state.principal?.effective_tenant?.id ?? "default";

  return (
    <AppShell onLogout={() => auth?.actions?.logout?.()}>
      <AnimatePresence mode="wait">
        {/*
         * 页面内容的唯一包装层，也是「底部留白等于其余三边」这条约束的落点。
         *
         * 页面有两种高度模式，由页面根元素上的 data-page-fill 声明，外壳用 :has() 读取：
         *
         * - 默认「随内容流动」：<main> 是 min-h-full，内容长了 main 跟着长高，底部内边距
         *   始终排在最后一块内容之后——滚到底时内容离底边仍留着一条和左右一样宽的留白。
         *   仪表盘、监控中心这类长页面都是这种。
         * - data-page-fill="always" | "md"「钉满一屏、内部滚动」：表格类页面让表格吃掉剩余
         *   高度、自己在内部滚。这需要一条确定高度的 flex 链：<main> 改 h-full，这一层与
         *   页面根都补 min-h-0（flex item 默认 min-height:auto 会被内容撑开，断一层约束
         *   整条就失效）。"md" 只在桌面宽度钉高，窄屏照样随内容流动。
         *
         * 以前（#909）是反过来的：对所有页面一律钉高。表格页因此不用声明，但长页面的内容
         * 会溢出被钉死的页面根，<main> 的底部内边距停在一屏高的位置，滚到底内容紧贴底边。
         * 现在默认流动：新写的长页面不会再踩这个坑；新写的表格页忘了声明，开发时就能
         * 看到表格没有在内部滚。
         *
         * flex-1 而不是 min-h-full：子元素的百分比高度需要父级有确定高度，实测会比内容盒
         * 矮十几到几十像素，底部于是凭空多出一条比左右宽的留白。flex-1 由 flex 直接分配
         * 剩余空间，不依赖百分比。
         *
         * `[&>*:only-child]:flex-1` 是给页面兜底的默认值：包装层撑满了，但它是透明的，
         * 里面的页面根要是没撑满，用户看到的还是底部那条更宽的留白。限定 :only-child 是
         * 因为返回多个兄弟节点的页面各自有布局意图，平分高度只会把它们改坏。
         * flex-basis 会盖掉页面根自己写的 height，这也正是各页面能摘掉
         * h-[calc(100dvh-…)] 这类魔数的前提。
         */}
        <Reveal
          key={`${location.pathname}:${tenantKey}`}
          className={[
            "flex flex-1 flex-col [&>*:only-child]:flex-1",
            "has-[>[data-page-fill=always]]:min-h-0 [&>[data-page-fill=always]]:min-h-0",
            "md:has-[>[data-page-fill=md]]:min-h-0 md:[&>[data-page-fill=md]]:min-h-0",
          ].join(" ")}
        >
          {outlet}
        </Reveal>
      </AnimatePresence>
    </AppShell>
  );
}
