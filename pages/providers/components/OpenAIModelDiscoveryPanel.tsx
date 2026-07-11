import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Check, RefreshCw } from "lucide-react";
import { Button } from "@code-proxy/ui";
import { TextInput } from "@code-proxy/ui";
import { useOptionalAuth } from "@app/providers/AuthProvider";

interface OpenAIModelDiscoveryPanelProps {
  discovering: boolean;
  discoverModels: () => Promise<void>;
  applyDiscoveredModels: () => void;
  discoveredModels: { id: string; owned_by?: string }[];
  discoverSelected: Set<string>;
  setDiscoverSelected: (value: React.SetStateAction<Set<string>>) => void;
}

export function OpenAIModelDiscoveryPanel({
  discovering,
  discoverModels,
  applyDiscoveredModels,
  discoveredModels,
  discoverSelected,
  setDiscoverSelected,
}: OpenAIModelDiscoveryPanelProps) {
  const { t } = useTranslation();
  const auth = useOptionalAuth();
  const canDiscover = auth?.state.principal
    ? auth.can("providers.test") &&
      auth.state.principal.effective_tenant.type === "system"
    : true;
  const [discoverQuery, setDiscoverQuery] = useState("");
  const discoveredListRef = useRef<HTMLDivElement | null>(null);
  const discoveredSectionRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (discoveredModels.length > 0 && discoveredSectionRef.current) {
      discoveredSectionRef.current.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }, [discoveredModels.length]);

  const filteredDiscoveredModels = useMemo(() => {
    const query = discoverQuery.trim().toLowerCase();
    if (!query) return discoveredModels;
    return discoveredModels.filter((model) => {
      const id = model.id.toLowerCase();
      const owner = (model.owned_by ?? "").toLowerCase();
      return id.includes(query) || owner.includes(query);
    });
  }, [discoverQuery, discoveredModels]);

  const discoveredModelsVirtualizer = useVirtualizer({
    count: filteredDiscoveredModels.length,
    getScrollElement: () => discoveredListRef.current,
    estimateSize: () => 28,
    overscan: 12,
  });

  const selectAllDiscovered = () => {
    setDiscoverSelected((prev) => {
      const next = new Set(prev);
      filteredDiscoveredModels.forEach((model) => next.add(model.id));
      return next;
    });
  };

  const deselectAllDiscovered = () => {
    setDiscoverSelected(() => new Set());
  };

  const handleCheckboxChange = (modelId: string) => {
    setDiscoverSelected((prev) => {
      const next = new Set(prev);
      if (next.has(modelId)) next.delete(modelId);
      else next.add(modelId);
      return next;
    });
  };

  if (!canDiscover) return null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900 dark:text-white">
          {t("providers.fetch_models")}
        </p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void discoverModels()}
          disabled={discovering}
        >
          <RefreshCw size={14} className={discovering ? "animate-spin" : ""} />
          {t("providers.fetch_models")}
        </Button>
      </div>

      {discoveredModels.length ? (
        <div
          ref={discoveredSectionRef}
          className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-neutral-800 dark:bg-neutral-900/40"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium text-slate-700 dark:text-white/70">
              {t("providers.found_models", { count: discoveredModels.length })}
            </p>
            <p className="text-xs tabular-nums text-slate-500 dark:text-white/50">
              {t("providers.models_selected_count", {
                count: discoverSelected.size,
              })}
            </p>
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <TextInput
              value={discoverQuery}
              onChange={(e) => setDiscoverQuery(e.currentTarget.value)}
              placeholder={t("providers.models_search_placeholder")}
              className="max-w-xs"
            />
            <Button variant="secondary" size="sm" onClick={selectAllDiscovered}>
              {t("providers.models_select_all")}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={deselectAllDiscovered}
            >
              {t("providers.models_select_none")}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={applyDiscoveredModels}
              disabled={discoverSelected.size === 0}
            >
              <Check size={14} />
              {t("providers.merge_selected")}
            </Button>
            {discoverQuery.trim() ? (
              <span className="text-xs text-slate-500 dark:text-white/55">
                {t("providers.models_filtered_count", {
                  shown: filteredDiscoveredModels.length,
                  total: discoveredModels.length,
                })}
              </span>
            ) : null}
          </div>

          <div
            ref={discoveredListRef}
            className="mt-2.5 max-h-52 overflow-y-auto rounded-xl border border-slate-200/80 bg-white dark:border-neutral-800/60 dark:bg-neutral-950/60"
            role="list"
            aria-label={t("providers.found_models", {
              count: discoveredModels.length,
            })}
          >
            <div
              style={{
                height: discoveredModelsVirtualizer.getTotalSize(),
                position: "relative",
              }}
            >
              {discoveredModelsVirtualizer.getVirtualItems().map((item) => {
                const model = filteredDiscoveredModels[item.index];
                if (!model) return null;
                const checked = discoverSelected.has(model.id);
                return (
                  <div
                    key={model.id}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      transform: `translateY(${item.start}px)`,
                    }}
                  >
                    <label className="flex cursor-pointer items-center gap-2.5 px-3 py-1 text-xs font-mono text-slate-700 transition-colors hover:bg-slate-50 dark:text-white/80 dark:hover:bg-white/5">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => handleCheckboxChange(model.id)}
                        className="h-3.5 w-3.5 shrink-0 rounded border-slate-300 text-blue-600 focus-visible:ring-2 focus-visible:ring-blue-400/35 dark:border-neutral-600 dark:bg-neutral-900 dark:text-blue-400 dark:focus-visible:ring-blue-400/20"
                      />
                      <span className="truncate">{model.id}</span>
                    </label>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
