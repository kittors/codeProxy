import { Button, type GridEmptyState } from "@code-proxy/ui";
import type { TFunction } from "i18next";

/**
 * 账号表格视图的空状态：一个账号都没有，或当前筛选下没有。后者写出生效的条件（类型、标签、
 * 状态、搜索、模型归属），给「清除筛选」，免得用户以为账号丢了。
 */
export function authFilesEmptyState(
  t: TFunction,
  {
    labels,
    hasFiles,
    onClear,
  }: { labels: readonly string[]; hasFiles: boolean; onClear: () => void },
): GridEmptyState {
  if (labels.length === 0 || !hasFiles) {
    return {
      title: t("auth_files_page.no_files"),
      description: t("auth_files_page.no_files_desc"),
    };
  }
  return {
    title: t("auth_files_page.no_files"),
    description: t("common.grid_filters_in_effect"),
    details: (
      <ul className="flex flex-wrap justify-center gap-1.5">
        {labels.map((label) => (
          <li
            key={label}
            className="rounded-full bg-ink/[0.05] px-2.5 py-1 text-xs text-ink-2 dark:bg-white/[0.07]"
          >
            {label}
          </li>
        ))}
      </ul>
    ),
    action: (
      <Button size="sm" onClick={onClear}>
        {t("common.grid_clear_filters")}
      </Button>
    ),
  };
}
