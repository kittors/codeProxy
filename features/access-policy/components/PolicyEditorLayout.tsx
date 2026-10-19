import { useId, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { motion, useReducedMotion } from "framer-motion";
import { CircleAlert } from "lucide-react";
import { NavList, type NavListGroup } from "@code-proxy/ui";

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
 * 策略编辑器的双栏骨架：左边按「账号 / 额度 / 模型 / 访问」分组的导航，右边是当前一段。
 * 字段一多（资料、模板、额度矩阵、规则、路由、访问范围、速率），一条长表单要滚很久才找得到；
 * 分段后每段一屏，导航上的数字和红点告诉人哪里配了东西、哪里还有错。窄屏导航变成横向滚动条。
 */
export function PolicyEditorLayout({
  groups,
  sections,
  value,
  onChange,
  ariaLabel,
  footerNote,
}: {
  groups: ReadonlyArray<{ id: string; label?: string }>;
  sections: readonly PolicyEditorSection[];
  value: string;
  onChange: (id: string) => void;
  ariaLabel: string;
  /** 右栏底部的常驻说明（例如「保存后对该账号的全部 Key 立即生效」）。 */
  footerNote?: ReactNode;
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
      <nav className="shrink-0 pt-3 sm:w-52 sm:overflow-y-auto sm:bg-subtle sm:pt-1">
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
      <section
        id={panelId}
        role="tabpanel"
        aria-labelledby={active ? `${idPrefix}-${active.id}` : undefined}
        className="flex min-h-0 min-w-0 flex-1 flex-col"
      >
        {active ? (
          <motion.div
            key={active.id}
            className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-5 sm:px-6"
            initial={reduceMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
          >
            <header className="mb-5">
              <h3 className="text-base font-semibold text-ink">{active.title}</h3>
              {active.description ? (
                <p className="mt-1 text-xs leading-5 text-ink-3">{active.description}</p>
              ) : null}
            </header>
            {active.content}
          </motion.div>
        ) : null}
        {footerNote ? (
          <div className="shrink-0 px-5 py-2.5 text-2xs text-ink-3 sm:px-6">{footerNote}</div>
        ) : null}
      </section>
    </div>
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
