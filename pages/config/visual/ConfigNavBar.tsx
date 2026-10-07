import { motion, useReducedMotion } from "framer-motion";
import { useRef, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { HUE_GLYPH, HUE_SOFT, HUE_SOLID, HUE_TILE, useScrollFade } from "@code-proxy/ui";
import type { ConfigGroupDef, ConfigNavGroupId, ConfigSectionDef, ConfigSectionId } from "./configSchema";

const cn = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(" ");

export interface ConfigGroupTab {
  def: ConfigGroupDef;
  /** 这一组里改过、还没保存的设置数。 */
  modified: number;
  /** 搜索时这一组命中的分区数；不在搜索时为 null。 */
  matches: number | null;
}

/**
 * 顶部的分组页签（基础 / 运行 / 日志与数据 / 高级）。
 *
 * 取代原来页面左侧的纵向分区目录：外壳已经有一列纵向侧边栏，页面里再竖一列目录，
 * 两层纵向菜单并排看着很挤。分组横向排在内容上方，选中的那组图标块变成该组色相的实色，
 * 背后的选中底块用共享布局动画滑过去；有未保存修改的组带一个圆点，搜索时显示命中数。
 */
export function ConfigGroupTabs({
  tabs,
  value,
  panelId,
  idPrefix,
  onChange,
}: {
  tabs: readonly ConfigGroupTab[];
  /** 当前分组；搜索时没有选中的分组（null）。 */
  value: ConfigNavGroupId | null;
  panelId: string;
  idPrefix: string;
  onChange: (id: ConfigNavGroupId) => void;
}) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const buttonsRef = useRef<Partial<Record<ConfigNavGroupId, HTMLButtonElement | null>>>({});

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const forward = event.key === "ArrowRight" || event.key === "ArrowDown";
    const backward = event.key === "ArrowLeft" || event.key === "ArrowUp";
    if (!forward && !backward) return;
    event.preventDefault();
    const index = Math.max(
      0,
      tabs.findIndex((tab) => tab.def.id === value),
    );
    const next = tabs[(index + (forward ? 1 : -1) + tabs.length) % tabs.length];
    if (!next) return;
    onChange(next.def.id);
    buttonsRef.current[next.def.id]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={t("config_ui.groups_label")}
      onKeyDown={onKeyDown}
      className="scrollbar-hidden relative flex max-w-full gap-1 overflow-x-auto rounded-2xl bg-track p-1"
    >
      {tabs.map(({ def, modified, matches }) => {
        const selected = def.id === value;
        const Icon = def.icon;
        const focusable = selected || (value === null && def.id === tabs[0]?.def.id);
        return (
          <button
            key={def.id}
            ref={(node) => {
              buttonsRef.current[def.id] = node;
            }}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${def.id}`}
            aria-selected={selected}
            aria-controls={panelId}
            tabIndex={focusable ? 0 : -1}
            onClick={() => onChange(def.id)}
            className={cn(
              "relative flex shrink-0 items-center gap-2 rounded-xl py-1.5 pr-3 pl-1.5 text-sm font-medium transition-colors",
              selected ? "text-ink" : "text-ink-2 hover:text-ink",
            )}
          >
            {selected ? (
              <motion.span
                layoutId={`${idPrefix}-group-pill`}
                aria-hidden="true"
                className="absolute inset-0 rounded-xl bg-elevated shadow-xs"
                transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 40 }}
              />
            ) : null}
            <span
              aria-hidden="true"
              className={cn(
                "relative grid h-7 w-7 shrink-0 place-items-center rounded-lg border transition-colors [&_svg]:size-[15px]",
                selected ? cn("border-transparent shadow-xs", HUE_SOLID[def.hue]) : HUE_TILE[def.hue],
              )}
            >
              <Icon />
            </span>
            <span className="relative">{t(`config_ui.groups.${def.id}`)}</span>
            {matches !== null ? (
              <span
                className={cn(
                  "relative min-w-5 rounded-full px-1.5 text-center text-2xs font-semibold tabular-nums",
                  matches > 0 ? HUE_SOFT[def.hue] : "bg-hover text-ink-3",
                )}
              >
                {matches}
                <span className="sr-only">{t("config_ui.group_matches", { count: matches })}</span>
              </span>
            ) : modified > 0 ? (
              <>
                <span aria-hidden="true" className="relative h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" />
                <span className="sr-only">{t("config_ui.section_modified")}</span>
              </>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/**
 * 当前分组里的分区胶囊：点一下滚到对应分区，滚动时高亮跟着走（`aria-current`）。
 * 每个胶囊前是该分区的彩色小图标，选中时整颗胶囊染成同色相的淡底；放不下时横向滚动，
 * 两端渐隐提示还有更多。
 */
export function ConfigSectionChips({
  sections,
  active,
  modifiedOf,
  onSelect,
}: {
  sections: readonly ConfigSectionDef[];
  active: ConfigSectionId | null;
  modifiedOf: (id: ConfigSectionId) => number;
  onSelect: (id: ConfigSectionId) => void;
}) {
  const { t } = useTranslation();
  const fade = useScrollFade<HTMLDivElement>({ axis: "x", size: 32 });
  if (sections.length === 0) return null;
  return (
    <nav aria-label={t("config_ui.nav_label")} className="min-w-0">
      <div
        ref={fade.ref}
        onScroll={fade.onScroll}
        style={fade.style}
        className={cn("scrollbar-hidden flex gap-1.5 overflow-x-auto py-0.5", fade.className)}
      >
        {sections.map((section) => {
          const selected = section.id === active;
          const dirty = modifiedOf(section.id) > 0;
          const Icon = section.icon;
          return (
            <button
              key={section.id}
              type="button"
              aria-current={selected ? "true" : undefined}
              onClick={() => onSelect(section.id)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                selected
                  ? cn("border-transparent", HUE_SOFT[section.hue])
                  : "border-line text-ink-2 hover:bg-hover hover:text-ink",
              )}
            >
              <Icon size={13} aria-hidden="true" className={HUE_GLYPH[section.hue]} />
              {t(`config_ui.sections.${section.id}.title`)}
              {dirty ? (
                <>
                  <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" />
                  <span className="sr-only">{t("config_ui.section_modified")}</span>
                </>
              ) : null}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
