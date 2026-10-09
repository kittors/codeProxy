import { useTranslation } from "react-i18next";
import { Loader2, Search, Tags, X } from "lucide-react";
import type { ContentModerationTagMode } from "@code-proxy/api-client";
import { Button, Select, TextInput, surface, iconHueClass } from "@code-proxy/ui";

export type PickerTab = "auth" | "provider";
export type ProviderScope = "provider_key" | "provider";

/**
 * 渠道选择器的筛选区，分两行：
 * 1. 找渠道：搜索、供应商、（供应商页签下的）渠道类型、只看已绑定；
 * 2. 标签：既是筛选条件，也是「按标签绑定」的依据——两件事挨在一起，说明也只写一次。
 * 以前八列网格把七个控件挤在一起，标签按钮和说明掉到另一行最右边，不容易看出它们是一组。
 */
export function ChannelPickerFilters({
  tab,
  providerScope,
  query,
  provider,
  boundOnly,
  tags,
  tagInput,
  tagMode,
  canTagBind,
  tagScanning,
  onQueryChange,
  onProviderChange,
  onProviderScopeChange,
  onBoundOnlyChange,
  onTagInputChange,
  onCommitTag,
  onRemoveTag,
  onTagModeChange,
  onTagBind,
}: {
  tab: PickerTab;
  providerScope: ProviderScope;
  query: string;
  provider: string;
  boundOnly: boolean;
  tags: string[];
  tagInput: string;
  tagMode: ContentModerationTagMode;
  canTagBind: boolean;
  tagScanning: boolean;
  onQueryChange: (value: string) => void;
  onProviderChange: (value: string) => void;
  onProviderScopeChange: (value: ProviderScope) => void;
  onBoundOnlyChange: (value: boolean) => void;
  onTagInputChange: (value: string) => void;
  onCommitTag: (value: string) => void;
  onRemoveTag: (tag: string) => void;
  onTagModeChange: (value: ContentModerationTagMode) => void;
  onTagBind: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className={`space-y-3 p-3 ${surface({ tone: "inset" })}`}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-[14rem] flex-1">
          <TextInput
            size="sm"
            value={query}
            onChange={(event) => onQueryChange(event.currentTarget.value)}
            placeholder={t("content_moderation.search_channels")}
            aria-label={t("content_moderation.search_channels")}
            startAdornment={<Search size={14} className="text-ink-3" aria-hidden="true" />}
          />
        </div>
        <div className="w-full sm:w-44">
          <TextInput
            size="sm"
            value={provider}
            onChange={(event) => onProviderChange(event.currentTarget.value)}
            placeholder={t("content_moderation.filter_provider")}
            aria-label={t("content_moderation.filter_provider")}
          />
        </div>
        {tab === "provider" ? (
          <div className="w-full sm:w-40">
            <Select
              size="sm"
              fullWidth
              value={providerScope}
              onChange={(value) => {
                if (value !== "provider_key" && value !== "provider") return;
                onProviderScopeChange(value);
              }}
              options={[
                { value: "provider_key", label: t("content_moderation.provider_scope_keys") },
                { value: "provider", label: t("content_moderation.provider_scope_defaults") },
              ]}
              aria-label={t("content_moderation.provider_scope")}
            />
          </div>
        ) : null}
        <div className="w-full sm:w-48">
          <Select
            size="sm"
            fullWidth
            value={boundOnly ? "bound" : "all"}
            onChange={(value) => onBoundOnlyChange(value === "bound")}
            options={[
              { value: "all", label: t("content_moderation.filter_all_channels") },
              { value: "bound", label: t("content_moderation.filter_bound_channels") },
            ]}
            aria-label={t("content_moderation.binding_filter")}
          />
        </div>
      </div>

      {/* 两行之间靠留白分开，不画分隔线。 */}
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-ink-2">
            <Tags size={14} className={`text-ink-3 ${iconHueClass(Tags)}`} aria-hidden="true" />
            {t("content_moderation.tags")}
          </span>
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1.5 rounded-full bg-ink/[0.05] py-0.5 pr-1 pl-2.5 text-xs font-medium text-ink-2 dark:bg-white/[0.07]"
            >
              {tag}
              <button
                type="button"
                onClick={() => onRemoveTag(tag)}
                aria-label={t("content_moderation.remove_filter_tag", { tag })}
                className="rounded-full p-0.5 text-ink-3 transition-colors hover:bg-hover hover:text-ink"
              >
                <X size={12} aria-hidden="true" />
              </button>
            </span>
          ))}
          <div className="min-w-[12rem] flex-1">
            <TextInput
              size="sm"
              value={tagInput}
              onChange={(event) => onTagInputChange(event.currentTarget.value)}
              onBlur={(event) => onCommitTag(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === ",") {
                  event.preventDefault();
                  onCommitTag(event.currentTarget.value);
                  return;
                }
                if (event.key === "Backspace" && !event.currentTarget.value && tags.length > 0) {
                  onRemoveTag(tags[tags.length - 1]!);
                }
              }}
              placeholder={t("content_moderation.tag_filter_placeholder")}
              aria-label={t("content_moderation.filter_tags")}
            />
          </div>
          <div className="w-full sm:w-40">
            <Select
              size="sm"
              fullWidth
              value={tagMode}
              onChange={(value) => {
                if (value !== "any" && value !== "all") return;
                onTagModeChange(value);
              }}
              options={[
                { value: "any", label: t("content_moderation.tag_mode_any") },
                { value: "all", label: t("content_moderation.tag_mode_all") },
              ]}
              aria-label={t("content_moderation.tag_mode")}
            />
          </div>
          <Button size="sm" onClick={onTagBind} disabled={!canTagBind}>
            {tagScanning ? (
              <Loader2 size={14} className="animate-spin" aria-hidden="true" />
            ) : (
              <Tags size={14} aria-hidden="true" />
            )}
            {tagScanning
              ? t("content_moderation.tag_bind_scanning")
              : t("content_moderation.tag_bind")}
          </Button>
        </div>
        <p className="mt-2 text-xs leading-5 text-ink-3">
          {tags.length
            ? t("content_moderation.tag_bind_hint")
            : t("content_moderation.tag_filter_hint")}
        </p>
      </div>
    </div>
  );
}
