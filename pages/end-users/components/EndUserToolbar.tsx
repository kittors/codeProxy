import { useTranslation } from "react-i18next";
import { RotateCcw, Search, ShieldCheck, X } from "lucide-react";
import type { ApiKeyPermissionProfile } from "@code-proxy/api-client";
import { Button, Select, TextInput } from "@code-proxy/ui";

export type EndUserStatusFilter = "all" | "active" | "frozen";
/** "all"、"custom"（单独设置）或某个模板 id。 */
export type EndUserSourceFilter = string;

/**
 * 列表上方的筛选与批量操作：按名称搜索、按状态、按权限来源（某个模板 / 单独设置）筛选；
 * 勾选账号后出现批量栏，一次把它们绑定到同一个模板。
 */
export function EndUserToolbar({
  search,
  onSearchChange,
  status,
  onStatusChange,
  source,
  onSourceChange,
  profiles,
  showSourceFilter,
  selectedCount,
  onBindSelected,
  onClearSelection,
  onClearFilters,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  status: EndUserStatusFilter;
  onStatusChange: (value: EndUserStatusFilter) => void;
  source: EndUserSourceFilter;
  onSourceChange: (value: EndUserSourceFilter) => void;
  profiles: ApiKeyPermissionProfile[];
  showSourceFilter: boolean;
  selectedCount: number;
  /** 不传时不显示批量绑定（后端不支持或没有写权限）。 */
  onBindSelected?: () => void;
  onClearSelection: () => void;
  onClearFilters: () => void;
}) {
  const { t } = useTranslation();
  const hasFilters = search.trim().length > 0 || status !== "all" || source !== "all";

  if (selectedCount > 0 && onBindSelected) {
    return (
      <div
        role="region"
        aria-label={t("access_policy.batch_bar_label")}
        className="mb-3 flex min-h-9 flex-shrink-0 flex-wrap items-center gap-2 rounded-full bg-accent-soft px-3 py-1.5"
      >
        <span className="text-sm font-medium text-ink">
          {t("access_policy.selected_accounts", { count: selectedCount })}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="primary" onClick={onBindSelected}>
            <ShieldCheck size={14} />
            {t("access_policy.batch_bind_action")}
          </Button>
          <Button size="sm" variant="ghost" onClick={onClearSelection}>
            <X size={14} />
            {t("access_policy.clear_selection")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-3 flex flex-shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1 sm:max-w-sm">
        <TextInput
          size="sm"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={t("end_users.search_placeholder")}
          aria-label={t("end_users.search_label")}
          startAdornment={<Search className="h-4 w-4 text-ink-3" aria-hidden />}
        />
      </div>
      <Select
        size="sm"
        value={status}
        onChange={(value) => onStatusChange(value === "active" || value === "frozen" ? value : "all")}
        options={[
          { value: "all", label: t("end_users.status_all") },
          { value: "active", label: t("end_users.status_active") },
          { value: "frozen", label: t("end_users.status_frozen") },
        ]}
        aria-label={t("end_users.status_filter")}
        className="w-full sm:w-36"
      />
      {showSourceFilter ? (
        <Select
          size="sm"
          value={source}
          onChange={onSourceChange}
          options={[
            { value: "all", label: t("access_policy.source_filter_all") },
            { value: "custom", label: t("access_policy.source_custom_short") },
            ...profiles.map((profile) => ({ value: profile.id, label: profile.name })),
          ]}
          aria-label={t("access_policy.source_filter_label")}
          className="w-full sm:w-44"
        />
      ) : null}
      {hasFilters ? (
        <Button size="sm" variant="ghost" className="self-start" onClick={onClearFilters}>
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          {t("end_users.clear_filters")}
        </Button>
      ) : null}
    </div>
  );
}
