import { useTranslation } from "react-i18next";
import { Plus, Settings2, Trash2 } from "lucide-react";
import type { OpenAIProvider } from "@/lib/http/types";
import { Button } from "@/modules/ui/Button";
import { Card } from "@/modules/ui/Card";
import { EmptyState } from "@/modules/ui/EmptyState";
import { ProviderStatusBar } from "@/modules/providers/ProviderStatusBar";

interface OpenAIProvidersTabProps {
  providers: OpenAIProvider[];
  openOpenAIEditor: (index: number | null) => void;
  confirmDelete: (index: number) => void;
  maskApiKey: (value: string) => string;
  getKeyEntryStats: (entry: NonNullable<OpenAIProvider["apiKeyEntries"]>[number]) => {
    success: number;
    failure: number;
  };
  getProviderStats: (provider: OpenAIProvider) => { success: number; failure: number };
  getProviderStatusBar: (provider: OpenAIProvider) => {
    blocks: Array<"idle" | "success" | "failure" | "mixed">;
    successRate: number;
    totalSuccess: number;
    totalFailure: number;
  };
}

export function OpenAIProvidersTab({
  providers,
  openOpenAIEditor,
  confirmDelete,
  maskApiKey,
  getKeyEntryStats,
  getProviderStats,
  getProviderStatusBar,
}: OpenAIProvidersTabProps) {
  const { t } = useTranslation();

  return (
    <Card
      title={t("providers.openai_compatible")}
      description={t("providers.claude_desc")}
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
        <div className="space-y-3">
          {providers.map((provider, idx) => {
            const headerEntries = Object.entries(provider.headers || {});
            const stats = getProviderStats(provider);
            const statusData = getProviderStatusBar(provider);

            return (
              <div
                key={`${provider.name}:${idx}`}
                className="rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                      {provider.name}
                    </p>
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
                            className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-700 dark:border-neutral-800 dark:bg-neutral-950/60 dark:text-white/75"
                          >
                            <span className="font-semibold">{key}:</span> {String(value)}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    {provider.apiKeyEntries?.length ? (
                      <div className="mt-2 space-y-1">
                        <p className="text-xs font-semibold text-slate-700 dark:text-white/75">
                          Keys: {provider.apiKeyEntries.length}
                        </p>
                        <div className="space-y-1">
                          {provider.apiKeyEntries.map((entry, entryIndex) => {
                            const entryStats = getKeyEntryStats(entry);
                            return (
                              <div
                                key={`${entry.apiKey}:${entryIndex}`}
                                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-xs dark:border-neutral-800 dark:bg-neutral-950/60"
                              >
                                <div className="min-w-0">
                                  <p className="truncate font-mono text-slate-900 dark:text-white">
                                    {entryIndex + 1}. {maskApiKey(entry.apiKey)}
                                  </p>
                                  {entry.proxyUrl ? (
                                    <p className="mt-0.5 truncate font-mono text-slate-600 dark:text-white/55">
                                      proxy: {entry.proxyUrl}
                                    </p>
                                  ) : null}
                                </div>
                                <div className="flex items-center gap-2 tabular-nums">
                                  <span className="rounded-full bg-emerald-600/10 px-2 py-0.5 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200">
                                    {t("providers.success_stats", { count: entryStats.success })}
                                  </span>
                                  <span className="rounded-full bg-rose-600/10 px-2 py-0.5 text-rose-700 dark:bg-rose-500/15 dark:text-rose-200">
                                    {t("providers.failed_stats", { count: entryStats.failure })}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}

                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-white/65 tabular-nums">
                      <span>
                        {t("providers.models_label")}: {provider.models?.length ?? 0}
                      </span>
                      <span>·</span>
                      <span>{t("providers.success_stats", { count: stats.success })}</span>
                      <span>·</span>
                      <span>{t("providers.failed_stats", { count: stats.failure })}</span>
                      {provider.testModel ? (
                        <>
                          <span>·</span>
                          <span className="truncate">testModel: {provider.testModel}</span>
                        </>
                      ) : null}
                    </div>

                    {provider.models?.length ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {provider.models.map((model) => (
                          <span
                            key={model.name}
                            className="rounded-full bg-slate-900 px-2 py-0.5 text-[11px] text-white dark:bg-white dark:text-neutral-950"
                            title={
                              model.alias && model.alias !== model.name
                                ? `${model.name} => ${model.alias}`
                                : model.name
                            }
                          >
                            {model.alias && model.alias !== model.name
                              ? `${model.name} → ${model.alias}`
                              : model.name}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    <ProviderStatusBar data={statusData} />
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="secondary" size="sm" onClick={() => openOpenAIEditor(idx)}>
                      <Settings2 size={14} />
                      {t("providers.edit")}
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => confirmDelete(idx)}>
                      <Trash2 size={14} />
                      {t("providers.delete")}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
