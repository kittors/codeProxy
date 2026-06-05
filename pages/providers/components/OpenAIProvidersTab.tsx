import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import type { OpenAIProvider } from "@code-proxy/api-client";
import { Button } from "@code-proxy/ui";
import { Card } from "@code-proxy/ui";
import { EmptyState } from "@code-proxy/ui";
import { ProviderCard } from "../ProviderCard";
import { ProviderStatusBar } from "@features/provider-latency";
import { ProviderMetricChip } from "./ProviderMetricChip";
import { ProviderModelChips } from "./ProviderModelChips";
import { OpenAIKeyEntrySummary } from "./OpenAIKeyEntrySummary";
import type { StatusBarData } from "@code-proxy/domain/usage";

interface OpenAIProvidersTabProps {
  providers: OpenAIProvider[];
  loading?: boolean;
  openOpenAIEditor: (index: number | null) => void;
  confirmDelete: (index: number) => void;
  maskApiKey: (value: string) => string;
  getKeyEntryStats: (entry: NonNullable<OpenAIProvider["apiKeyEntries"]>[number]) => {
    success: number;
    failure: number;
  };
  getProviderStats: (provider: OpenAIProvider) => { success: number; failure: number };
  getProviderStatusBar: (provider: OpenAIProvider) => StatusBarData;
  onToggleProviderEnabled?: (providerIndex: number, enabled: boolean) => void;
  onToggleKeyEntryEnabled?: (providerIndex: number, entryIndex: number, enabled: boolean) => void;
  selectedKeys?: Set<string>;
  onToggleSelected?: (key: string, checked: boolean) => void;
}

export function OpenAIProvidersTab({
  providers,
  loading = false,
  openOpenAIEditor,
  confirmDelete,
  maskApiKey,
  getKeyEntryStats,
  getProviderStats,
  getProviderStatusBar,
  onToggleProviderEnabled,
  onToggleKeyEntryEnabled,
  selectedKeys,
  onToggleSelected,
}: OpenAIProvidersTabProps) {
  const { t } = useTranslation();

  return (
    <Card
      title={t("providers.openai_compatible")}
      description={t("providers.openai_tab_desc")}
      className="flex h-full min-h-0 flex-col"
      bodyClassName="min-h-0 flex flex-1 flex-col"
      loading={loading}
      actions={
        <Button variant="primary" size="sm" onClick={() => openOpenAIEditor(null)}>
          <Plus size={14} />
          {t("providers.add_provider")}
        </Button>
      }
    >
      {providers.length === 0 ? (
        <EmptyState
          title={t("providers.no_openai_providers")}
          description={t("providers.no_openai_desc")}
        />
      ) : (
        <div
          data-testid="providers-tab-scroll"
          className="min-h-0 flex-1 overflow-y-auto pr-1 grid gap-3 items-start content-start justify-start"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 18rem), 22rem))" }}
        >
          {providers.map((provider, idx) => {
            const selectionKey = `${provider.name.trim().toLowerCase()}:${idx}`;
            const selected = selectedKeys?.has(selectionKey) ?? false;
            const headerEntries = Object.entries(provider.headers || {});
            const stats = getProviderStats(provider);
            const statusData = getProviderStatusBar(provider);

            return (
              <ProviderCard
                key={`${provider.name}:${idx}`}
                title={provider.name}
                selected={selected}
                enabled={provider.disabled !== true}
                dimmed={provider.disabled === true}
                onToggleSelected={
                  onToggleSelected
                    ? (checked) => onToggleSelected(selectionKey, checked)
                    : undefined
                }
                onToggleEnabled={
                  onToggleProviderEnabled
                    ? (enabled) => onToggleProviderEnabled(idx, enabled)
                    : undefined
                }
                onEdit={() => openOpenAIEditor(idx)}
                onDelete={() => confirmDelete(idx)}
              >
                {provider.prefix ? (
                  <p className="mt-1 truncate font-mono text-xs text-slate-700 dark:text-slate-200">
                    prefix: {provider.prefix}
                  </p>
                ) : null}
                <p className="mt-1 truncate font-mono text-xs text-slate-700 dark:text-slate-200">
                  baseUrl: {provider.baseUrl || "--"}
                </p>

                {headerEntries.length ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {headerEntries.map(([key, value]) => (
                      <span
                        key={key}
                        className="inline-flex max-w-full min-w-0 items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-700 dark:border-neutral-800 dark:bg-neutral-950/60 dark:text-white/75"
                        title={`${key}: ${String(value)}`}
                      >
                        <span className="shrink-0 font-semibold">{key}:</span>
                        <span className="min-w-0 truncate">{String(value)}</span>
                      </span>
                    ))}
                  </div>
                ) : null}

                {provider.apiKeyEntries?.length ? (
                  <OpenAIKeyEntrySummary
                    entries={provider.apiKeyEntries}
                    maskApiKey={maskApiKey}
                    getKeyEntryStats={getKeyEntryStats}
                    onToggleKeyEntryEnabled={
                      onToggleKeyEntryEnabled
                        ? (entryIndex, enabled) => onToggleKeyEntryEnabled(idx, entryIndex, enabled)
                        : undefined
                    }
                  />
                ) : null}

                <div className="mt-2 flex flex-wrap gap-1.5">
                  <ProviderMetricChip
                    tone="blue"
                    label={t("providers.models_label")}
                    value={provider.models?.length ?? 0}
                  />
                  <ProviderMetricChip
                    tone={stats.success > 0 ? "emerald" : "slate"}
                    label={t("providers.success_stats", { count: stats.success })}
                  />
                  <ProviderMetricChip
                    tone={stats.failure > 0 ? "rose" : "slate"}
                    label={t("providers.failed_stats", { count: stats.failure })}
                  />
                  {provider.testModel ? (
                    <span className="inline-flex items-center rounded-full bg-slate-600/10 px-2 py-0.5 text-[11px] font-medium text-slate-700 dark:bg-white/10 dark:text-white/65">
                      testModel: {provider.testModel}
                    </span>
                  ) : null}
                </div>

                {provider.models?.length ? (
                  <div className="mt-2">
                    <ProviderModelChips models={provider.models} maxVisible={6} />
                  </div>
                ) : null}

                <ProviderStatusBar data={statusData} />
              </ProviderCard>
            );
          })}
        </div>
      )}
    </Card>
  );
}
