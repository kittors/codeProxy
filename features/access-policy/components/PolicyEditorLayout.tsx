import { useId, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { motion, useReducedMotion } from "framer-motion";
import { CircleAlert } from "lucide-react";
import { cn, DialogIcon, NavList, useScrollFade, type NavListGroup } from "@code-proxy/ui";

export interface PolicyEditorSection {
  id: string;
  group: string;
  label: string;
  icon: ReactNode;
  /** 导航右侧的小标记（规则数、路由数……）。 */
  badge?: ReactNode;
  /** 这一段有待修改的错误：导航上显示红色提示图标。 */
  invalid?: boolean;
  title: string;
  description?: ReactNode;
  content: ReactNode;
}

/**
 * 策略编辑器整张弹窗的骨架：左侧是贯穿上下的侧栏（标题、正在编辑的对象、分组导航、底部说明），
 * 右侧是当前一段的内容和操作按钮。放进 `Modal hideHeader`，不用弹窗自带的头尾——
 * 头尾横跨两栏时，侧栏只剩中间一截淡底，上下被切断，像一块浮在中间的灰板。
 *
 * 字段一多（资料、模板、额度矩阵、规则、路由、访问范围、速率），一条长表单要滚很久才找得到；
 * 分段后每段一屏，导航上的数字和红点告诉人哪里配了东西、哪里还有错。窄屏导航变成横向滚动条。
 */
export function PolicyEditorLayout({
  icon,
  title,
  subtitle,
  groups,
  sections,
  value,
  onChange,
  ariaLabel,
  sidebarNote,
  footerStart,
  footer,
}: {
  icon: ReactNode;
  title: string;
  /** 正在编辑的对象（账号名、模板名），写在标题下面。 */
  subtitle?: ReactNode;
  groups: ReadonlyArray<{ id: string; label?: string }>;
  sections: readonly PolicyEditorSection[];
  value: string;
  onChange: (id: string) => void;
  ariaLabel: string;
  /** 侧栏底部的常驻说明（例如「跟随模板「Pro」」「保存后立即生效」）。 */
  sidebarNote?: ReactNode;
  /** 按钮左侧的辅助信息（服务端拒绝的原因）。 */
  footerStart?: ReactNode;
  footer: ReactNode;
}) {
  const { t } = useTranslation();
  const idPrefix = `policy-tab-${useId().replace(/:/g, "")}`;
  const panelId = `${idPrefix}-panel`;
  const reduceMotion = useReducedMotion();
  const active = sections.find((section) => section.id === value) ?? sections[0];
  const navGroups: NavListGroup[] = groups
    .map((group) => ({
      id: group.id,
      label: group.label,
      items: sections
        .filter((section) => section.group === group.id)
        .map((section) => ({
          id: section.id,
          label: section.label,
          icon: section.icon,
          badge:
            section.invalid || section.badge ? (
              <span className="flex items-center gap-1">
                {section.badge}
                {section.invalid ? (
                  <CircleAlert size={14} aria-hidden="true" className="text-rose-500 dark:text-rose-400" />
                ) : null}
              </span>
            ) : undefined,
          srHint: section.invalid ? t("access_policy.section_has_errors") : undefined,
        })),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <div className="flex h-full min-h-0 flex-col sm:flex-row">
      <aside className="flex shrink-0 flex-col sm:w-60 sm:bg-subtle">
        <div className="flex items-center gap-3 px-5 pb-2 pt-5 pr-14 sm:pr-5">
          <DialogIcon>{icon}</DialogIcon>
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold tracking-tight text-ink">{title}</h2>
            {subtitle ? <p className="truncate text-xs text-ink-3">{subtitle}</p> : null}
          </div>
        </div>
        <nav className="min-h-0 sm:flex-1 sm:overflow-y-auto">
          <NavList
            mode="tabs"
            groups={navGroups}
            value={active?.id ?? ""}
            onChange={onChange}
            ariaLabel={ariaLabel}
            idPrefix={idPrefix}
            panelId={panelId}
          />
        </nav>
        {sidebarNote ? (
          <div className="hidden px-5 pb-5 pt-2 text-2xs leading-5 text-ink-3 sm:block">{sidebarNote}</div>
        ) : null}
      </aside>
      {/* overflow-hidden：分区切换的入场位移（y: 6）不能把内容推出盒子，否则会撑大外层弹窗
          主体的可滚动高度，弹窗随即给整块主体挂上底部渐隐。 */}
      <section
        id={panelId}
        role="tabpanel"
        aria-labelledby={active ? `${idPrefix}-${active.id}` : undefined}
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      >
        {active ? <SectionPane key={active.id} section={active} animate={!reduceMotion} /> : null}
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-x-4 gap-y-3 px-6 pb-6 pt-3">
          {footerStart ? <div className="min-w-0 flex-1">{footerStart}</div> : null}
          <div className="flex items-center gap-2.5 max-sm:w-full max-sm:[&>button]:flex-1">{footer}</div>
        </div>
      </section>
    </div>
  );
}

/**
 * 一段的内容区，按分段 key 重新挂载：切换分段时滚动位置回到顶部，滚动渐隐也重新测量。
 * 按钮栏紧贴在下面、中间没有分隔线，内容滚到按钮上方时靠底部渐隐收尾，而不是一刀切断。
 */
function SectionPane({ section, animate }: { section: PolicyEditorSection; animate: boolean }) {
  const fade = useScrollFade<HTMLDivElement>({ size: 32 });
  return (
    <motion.div
      ref={fade.ref}
      onScroll={fade.onScroll}
      className={cn("min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-5 sm:pt-6", fade.className)}
      style={fade.style}
      initial={animate ? { opacity: 0, y: 6 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
      // 入场位移结束后再量一次：transform 的变化不触发 ResizeObserver。
      onAnimationComplete={fade.measure}
    >
      {/* 右上角是弹窗的关闭按钮，标题区让出位置。 */}
      <header className="mb-5 sm:pr-10">
        <h3 className="text-base font-semibold text-ink">{section.title}</h3>
        {section.description ? (
          <p className="mt-1 text-xs leading-5 text-ink-3">{section.description}</p>
        ) : null}
      </header>
      {section.content}
    </motion.div>
  );
}

/** 导航上的数量标记（规则数、路由数）；0 不显示。 */
export function NavCountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-ink/[0.06] px-1.5 text-2xs font-semibold tabular-nums text-ink-2 dark:bg-white/[0.08]">
      {count}
    </span>
  );
}
