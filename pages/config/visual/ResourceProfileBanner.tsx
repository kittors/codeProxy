import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, ChevronDown, Gauge, Leaf } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { VisualConfigValues } from "@features/visual-config-editor";
import { Button, DialogIcon, surface } from "@code-proxy/ui";
import { CONFIG_FIELDS, type ConfigFieldDef } from "./configSchema";
import { fieldLabelKey } from "./configSearch";

/**
 * 低资源生产档位：面向 2 vCPU / 2 GB 主机的推荐值。只改日志、保留与监控相关的项，
 * 路由、额度、费用与延迟统计都不受影响。
 */
const RECOMMENDED: ReadonlyArray<readonly [fieldId: string, value: string | boolean]> = [
  ["debug", false],
  ["request_log", false],
  ["log_to_file", false],
  ["usage_stats", false],
  ["commercial", false],
  ["log_size", "128"],
  ["error_files", "10"],
  ["stats_cache", "60"],
  ["ws_max_age", "300"],
  ["store_content", false],
  ["detail_retention", "7"],
  ["body_retention", "3"],
  ["cleanup_enabled", true],
  ["cleanup_interval", "60"],
  ["max_rows", "100000"],
  ["metadata_cap", "256"],
  ["body_cap", "128"],
];

const FIELD_BY_ID = new Map(CONFIG_FIELDS.map((field) => [field.id, field]));

type PendingChange = { field: ConfigFieldDef; from: string | boolean; to: string | boolean };

function useRecommendedChanges(values: VisualConfigValues): PendingChange[] {
  return useMemo(
    () =>
      RECOMMENDED.flatMap(([id, to]) => {
        const field = FIELD_BY_ID.get(id);
        if (!field) return [];
        const from = field.get(values);
        return from === to ? [] : [{ field, from, to }];
      }),
    [values],
  );
}

export function ResourceProfileBanner({
  values,
  disabled,
  onChange,
}: {
  values: VisualConfigValues;
  disabled?: boolean;
  onChange: (patch: Partial<VisualConfigValues>) => void;
}) {
  const { t } = useTranslation();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const changes = useRecommendedChanges(values);
  const active = changes.length === 0;

  const formatValue = (value: string | boolean) => {
    if (typeof value === "boolean") return value ? t("config_ui.on") : t("config_ui.off");
    return value.trim() === "" ? t("config_ui.empty_value") : value;
  };

  // 一次性暂存所有推荐值（一次 onChange），保存时与其它改动一起确认。
  const apply = () => {
    let next = values;
    const patch: Partial<VisualConfigValues> = {};
    for (const [id, to] of RECOMMENDED) {
      const field = FIELD_BY_ID.get(id);
      if (!field) continue;
      const fieldPatch = field.set(next, to);
      next = { ...next, ...fieldPatch };
      Object.assign(patch, fieldPatch);
    }
    onChange(patch);
    setOpen(false);
  };

  return (
    // 和下面的设置组同一层、同一种卡片（伪元素细边 + 投影），不描边。简约风格下「推荐」靠标题、
    // 按钮和「已应用」状态说清；多彩风格叠一层绿→青渐变淡底，和下面白底的设置分区区分开。
    // 叶子图标：图标着色多彩时是绿色图标块（叶子 = 省资源），单色时是无底的中性小图标。
    <section
      className={`${surface({ radius: "2xl" })} colorful:bg-gradient-to-r colorful:from-emerald-500/[0.07] colorful:via-teal-500/[0.04] colorful:to-transparent colorful:dark:from-emerald-400/[0.08] colorful:dark:via-teal-400/[0.04]`}
    >
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
        <div className="flex min-w-0 flex-1 items-start gap-3 icon-hue:gap-3.5">
          <DialogIcon tone="emerald" className="hidden icon-hue:grid">
            <Leaf />
          </DialogIcon>
          <Leaf size={18} className="mt-0.5 shrink-0 text-ink-3 icon-hue:hidden" aria-hidden="true" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold text-ink">{t("resource_config.title")}</h3>
              <span
                className={
                  active
                    ? "rounded-full bg-emerald-500/10 px-2 py-0.5 text-2xs font-medium text-emerald-700 dark:text-emerald-300"
                    : "rounded-full bg-selected px-2 py-0.5 text-2xs font-medium text-ink-2"
                }
              >
                {active ? t("resource_config.profile_active") : t("resource_config.profile_custom")}
              </span>
            </div>
            <p className="mt-0.5 text-sm leading-relaxed text-ink-3">
              {t("config_ui.profile.desc")}
            </p>
            {active ? null : (
              <button
                type="button"
                aria-expanded={open}
                aria-controls={listId}
                onClick={() => setOpen((previous) => !previous)}
                className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-ink-2 transition-colors hover:text-ink"
              >
                {t("config_ui.profile.preview", { count: changes.length })}
                <ChevronDown
                  size={13}
                  aria-hidden="true"
                  className={["transition-transform duration-200", open ? "rotate-180" : ""].join(" ")}
                />
              </button>
            )}
          </div>
        </div>
        <Button
          variant={active ? "success" : "primary"}
          onClick={apply}
          disabled={disabled || active}
          className="shrink-0 self-start sm:self-center"
        >
          <Gauge size={16} aria-hidden="true" />
          {active ? t("resource_config.applied") : t("resource_config.apply_recommended")}
        </Button>
      </div>
      <AnimatePresence initial={false}>
        {open && !active ? (
          <motion.div
            id={listId}
            key="changes"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
            className="overflow-hidden"
          >
            <ul className="grid gap-x-6 gap-y-1.5 px-4 pb-4 text-sm sm:grid-cols-2 sm:px-5 sm:pb-5">
              {changes.map(({ field, from, to }) => (
                <li key={field.id} className="flex min-w-0 items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-ink-2">{t(fieldLabelKey(field))}</span>
                  <span className="shrink-0 font-mono text-xs text-ink-3 line-through decoration-ink-4">
                    {formatValue(from)}
                  </span>
                  <ArrowRight size={12} className="shrink-0 text-ink-3 colorful:text-emerald-500" aria-hidden="true" />
                  <span className="shrink-0 font-mono text-xs font-medium text-ink">
                    {formatValue(to)}
                  </span>
                </li>
              ))}
            </ul>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
