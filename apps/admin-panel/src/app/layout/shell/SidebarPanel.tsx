import { useTranslation } from "react-i18next";
import { ScrollArea } from "@code-proxy/ui";
import type { NavSection } from "./navModel";
import { SidebarItemLink } from "./SidebarItemLink";
import type { RouteNavigation } from "./useRouteNavigation";

/**
 * 分区面板：图标栏右侧那一列，列出当前分区下的页面。
 *
 * 收起时宽度过渡到 0、内容淡出并左移 14px；左侧两角是大圆角，嵌在图标栏的灰底上。
 * 内容层固定 260px 宽、绝对定位：宽度收缩时文字不会被挤得换行，只是被逐渐裁掉。
 * 收起后整块设为 inert，里面的链接不会再被 Tab 选中，也不会被读屏读到。
 */
export function SidebarPanel({
  section,
  activeTo,
  collapsed,
  nav,
}: {
  section: NavSection | null;
  activeTo: string | null;
  collapsed: boolean;
  nav: RouteNavigation;
}) {
  const { t } = useTranslation();
  const title = section ? t(section.i18nKey, { defaultValue: section.i18nKey }) : "";

  return (
    <div
      data-sidebar-panel="true"
      inert={collapsed}
      className={[
        "relative h-full shrink-0 overflow-hidden rounded-l-2xl border-r bg-panel",
        "transition-[width,border-color] duration-[360ms] ease-soft motion-reduce:transition-none",
        collapsed ? "w-0 border-transparent" : "w-[16.25rem] border-line",
      ].join(" ")}
    >
      <div
        className={[
          "absolute inset-y-0 left-0 flex w-[16.25rem] flex-col",
          "transition-[opacity,transform] duration-[250ms] ease-soft motion-reduce:transition-none",
          collapsed ? "pointer-events-none -translate-x-3.5 opacity-0" : "translate-x-0 opacity-100",
        ].join(" ")}
      >
        <div className="flex h-15 shrink-0 items-center px-5">
          <span className="min-w-0 truncate text-lg font-semibold tracking-tight text-ink">
            {title}
          </span>
        </div>
        <ScrollArea
          className="min-h-0 flex-1 [&_[data-scroll-area-scrollbar='y']]:right-1"
          scrollbarVisibility="track-hover"
          scrollbarTrackInset={12}
        >
          {/* 换分区时整列轻轻上浮淡入，读起来是「换了一组页面」而不是闪一下。 */}
          <nav
            key={section?.id ?? "none"}
            aria-label={title}
            className="space-y-0.5 px-2.5 pt-0.5 pb-5 motion-safe:animate-[sidebar-swap_250ms_cubic-bezier(0.2,0.8,0.2,1)]"
          >
            {section?.items.map((item) => (
              <SidebarItemLink
                key={item.to}
                item={item}
                label={t(item.i18nKey, { defaultValue: item.i18nKey })}
                active={activeTo === item.to}
                onNavigate={nav.handleNavClick}
                onWarm={nav.warmPageRoute}
              />
            ))}
          </nav>
        </ScrollArea>
      </div>
    </div>
  );
}
