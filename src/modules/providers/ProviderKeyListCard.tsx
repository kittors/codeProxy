import type { LucideIcon } from "lucide-react";
import { Copy, Plus, Settings2, Trash2 } from "lucide-react";
import type { ProviderSimpleConfig } from "@/lib/http/types";
import { Button } from "@/modules/ui/Button";
import { Card } from "@/modules/ui/Card";
import { EmptyState } from "@/modules/ui/EmptyState";
import { ToggleSwitch } from "@/modules/ui/ToggleSwitch";
import { ProviderStatusBar } from "@/modules/providers/ProviderStatusBar";
import type { KeyStatBucket, StatusBarData } from "@/modules/providers/provider-usage";
import {
  hasDisableAllModelsRule,
  maskApiKey,
  stripDisableAllModelsRule,
} from "@/modules/providers/providers-helpers";

export function ProviderKeyListCard({
  icon: Icon,
  title,
  description,
  items,
  onAdd,
  onEdit,
  onDelete,
  onToggleEnabled,
  onCopy,
  getStats,
  getStatusBar,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  items: ProviderSimpleConfig[];
  onAdd: () => void;
  onEdit: (index: number) => void;
  onDelete: (index: number) => void;
  onToggleEnabled?: (index: number, enabled: boolean) => void;
  onCopy: (index: number) => void;
  getStats: (item: ProviderSimpleConfig) => KeyStatBucket;
  getStatusBar: (item: ProviderSimpleConfig) => StatusBarData;
}) {
  return (
    <Card
      title={title}
      description={description}
      actions={
        <Button variant="primary" size="sm" onClick={onAdd}>
          <Plus size={14} />
          新增
        </Button>
      }
    >
      {items.length === 0 ? (
        <EmptyState title="暂无配置" description="点击“新增”创建第一条配置。" />
      ) : (
        <div className="space-y-3">
          {items.map((item, idx) => {
            const disabled = hasDisableAllModelsRule(item.excludedModels);
            const headerEntries = Object.entries(item.headers || {});
            const excludedModels = stripDisableAllModelsRule(item.excludedModels);
            const models = item.models || [];
            const stats = getStats(item);
            const statusData = getStatusBar(item);

            return (
              <div
                key={`${item.apiKey}:${idx}`}
                className="rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                      <Icon size={16} className="text-slate-900 dark:text-white" />
                      <span className="truncate">{maskApiKey(item.apiKey)}</span>
                      {disabled ? (
                        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-200">
                          已禁用
                        </span>
                      ) : null}
                    </p>

                    <div className="mt-1 space-y-1 text-xs text-slate-600 dark:text-white/65">
                      <p className="truncate font-mono">prefix：{item.prefix || "--"}</p>
                      <p className="truncate font-mono">baseUrl：{item.baseUrl || "--"}</p>
                      {item.proxyUrl ? (
                        <p className="truncate font-mono">proxyUrl：{item.proxyUrl}</p>
                      ) : null}
                      <p className="tabular-nums">
                        models：{models.length} · excluded：{excludedModels.length} · headers：
                        {headerEntries.length} · 成功：{stats.success} · 失败：{stats.failure}
                      </p>
                    </div>

                    {headerEntries.length ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {headerEntries.map(([k, v]) => (
                          <span
                            key={k}
                            className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-700 dark:border-neutral-800 dark:bg-neutral-950/60 dark:text-white/75"
                          >
                            <span className="font-semibold">{k}:</span> {String(v)}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    {models.length ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {models.map((model) => (
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

                    {excludedModels.length ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {excludedModels.map((model) => (
                          <span
                            key={model}
                            className="rounded-full bg-rose-600/10 px-2 py-0.5 text-[11px] text-rose-700 dark:bg-rose-500/15 dark:text-rose-200"
                          >
                            {model}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    <ProviderStatusBar data={statusData} />
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {onToggleEnabled ? (
                      <div className="inline-flex items-center gap-2">
                        <span className="text-sm font-semibold leading-none text-slate-900 dark:text-white">
                          启用
                        </span>
                        <ToggleSwitch
                          checked={!disabled}
                          ariaLabel="启用"
                          onCheckedChange={(enabled) => onToggleEnabled(idx, enabled)}
                        />
                      </div>
                    ) : null}
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => onCopy(idx)}
                      title="复制 API Key"
                    >
                      <Copy size={14} />
                      复制
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => onEdit(idx)}>
                      <Settings2 size={14} />
                      编辑
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => onDelete(idx)}>
                      <Trash2 size={14} />
                      删除
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
