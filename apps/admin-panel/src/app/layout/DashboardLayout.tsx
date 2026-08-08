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
         * 这里必须用 flex-1 而不是 min-h-full：外层 <main> 的高度是靠 min-height 撑出来的，
         * 不是确定值，子元素的百分比高度没有可解析的基准，实测会比内容盒矮十几到几十像素，
         * 于是底部凭空多出一条比左右宽的留白。flex-1 由 flex 直接分配剩余空间，不依赖百分比。
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
          className="flex flex-1 flex-col [&>*:only-child]:flex-1"
        >
          {outlet}
        </Reveal>
      </AnimatePresence>
    </AppShell>
  );
}
