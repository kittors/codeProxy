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
         * 这里必须用 flex-1 而不是 min-h-full：子元素的百分比高度需要父级有确定高度，
         * 实测会比内容盒矮十几到几十像素，底部于是凭空多出一条比左右宽的留白。
         * flex-1 由 flex 直接分配剩余空间，不依赖百分比。
         *
         * 配套地，AppShell 的 <main> 用的是 h-full 而不是 min-h-full：min-height 撑出来的
         * 高度不是确定值，整条 flex 链就没有可分配的上限，页面里「表格吃掉剩余高度、自己
         * 内部滚」的写法会全部落空，内容把外壳一路撑开——各页面以前正是靠
         * h-[calc(100dvh-300px)] 这类手工累加的数字绕开它，代价是每次尺寸变动集体失准。
         * 钉死高度后长页面照样能滚：main 不裁剪，溢出部分仍算进外层滚动容器的可滚区域。
         *
         * 不加 min-h-0：保留 min-height:auto，内容超过一屏时容器仍会被撑开、交给外层滚动；
         * 加了反而会把长页面裁掉。需要内部滚动的页面在自己的根容器上写 flex-1 + min-h-0。
         *
         * `[&>*:only-child]:flex-1` 是给页面兜底的默认值：包装层撑满了，但它是透明的，
         * 里面的页面根要是没撑满，用户看到的还是底部那条更宽的留白。限定 :only-child 是
         * 因为返回多个兄弟节点的页面各自有布局意图，平分高度只会把它们改坏。
         * flex-basis 会盖掉页面根自己写的 height，这也正是各页面能摘掉
         * h-[calc(100dvh-…)] 这类魔数的前提。
         */}
        <Reveal
          key={`${location.pathname}:${tenantKey}`}
          className="flex min-h-0 flex-1 flex-col [&>*:only-child]:min-h-0 [&>*:only-child]:flex-1"
        >
          {outlet}
        </Reveal>
      </AnimatePresence>
    </AppShell>
  );
}
