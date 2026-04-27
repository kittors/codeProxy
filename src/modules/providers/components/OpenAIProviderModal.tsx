import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Check, Copy, Plus, RefreshCw, Trash2 } from "lucide-react";
import type { OpenAIDraft } from "@/modules/providers/providers-helpers";
import { buildModelsEndpoint } from "@/modules/providers/providers-helpers";
import { Button } from "@/modules/ui/Button";
import { TextInput } from "@/modules/ui/Input";
import { Modal } from "@/modules/ui/Modal";
import { KeyValueInputList } from "@/modules/providers/KeyValueInputList";
import { ModelInputList } from "@/modules/providers/ModelInputList";
import type { ProxyPoolEntry } from "@/lib/http/apis/proxies";
import { ProxyPoolSelect } from "@/modules/proxies/ProxyPoolSelect";

interface OpenAIProviderModalProps {
  open: boolean;
  editOpenAIIndex: number | null;
  openaiDraft: OpenAIDraft;
  setOpenaiDraft: Dispatch<SetStateAction<OpenAIDraft>>;
  openaiDraftError: string | null;
  closeOpenAIEditor: () => void;
  saveOpenAIDraft: () => Promise<void>;
  discovering: boolean;
  discoverModels: () => Promise<void>;
  applyDiscoveredModels: () => void;
  discoveredModels: { id: string; owned_by?: string }[];
  discoverSelected: Set<string>;
  setDiscoverSelected: Dispatch<SetStateAction<Set<string>>>;
  proxyPoolEntries: ProxyPoolEntry[];
  copyText: (text: string) => Promise<void>;
  maskApiKey: (value: string) => string;
}

export function OpenAIProviderModal({
  open,
  editOpenAIIndex,
  openaiDraft,
  setOpenaiDraft,
  openaiDraftError,
  closeOpenAIEditor,
  saveOpenAIDraft,
  discovering,
  discoverModels,
  applyDiscoveredModels,
  discoveredModels,
  discoverSelected,
  setDiscoverSelected,
  proxyPoolEntries,
  copyText,
  maskApiKey,
}: OpenAIProviderModalProps) {
  const { t } = useTranslation();
  const [discoverQuery, setDiscoverQuery] = useState("");
  const discoveredListRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      setDiscoverQuery("");
      return;
    }
    setDiscoverQuery("");
  }, [editOpenAIIndex, open]);

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

  return (
    <Modal
      open={open}
      title={
        editOpenAIIndex === null
          ? t("providers.add_openai_provider")
          : t("providers.edit_openai_provider")
      }
      description={t("providers.openai_config_desc")}
      onClose={closeOpenAIEditor}
      footer={
        <div className="flex flex-wrap items-center gap-2">
          {openaiDraftError ? (
            <span className="text-sm font-semibold text-rose-700 dark:text-rose-200">
              {openaiDraftError}
            </span>
          ) : null}
          <Button variant="secondary" onClick={closeOpenAIEditor}>
            {t("providers.cancel")}
          </Button>
          <Button variant="primary" onClick={() => void saveOpenAIDraft()}>
            <Check size={14} />
            {t("providers.save")}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              {t("providers.name")}
            </p>
            <TextInput
              value={openaiDraft.name}
              onChange={(e) => {
                const value = e.currentTarget.value;
                setOpenaiDraft((prev) => ({ ...prev, name: value }));
              }}
              placeholder={t("providers.name_placeholder")}
            />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              {t("providers.base_url")}
            </p>
            <TextInput
              value={openaiDraft.baseUrl}
              onChange={(e) => {
                const value = e.currentTarget.value;
                setOpenaiDraft((prev) => ({
                  ...prev,
                  baseUrl: value,
                }));
              }}
              placeholder={t("providers.base_url_placeholder")}
            />
            <p className="text-xs text-slate-500 dark:text-white/55">
              {t("providers.models_fetch_url")}
              {openaiDraft.baseUrl.trim() ? buildModelsEndpoint(openaiDraft.baseUrl) : "--"}
            </p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              {t("providers.prefix_optional")}
            </p>
            <TextInput
              value={openaiDraft.prefix}
              onChange={(e) => {
                const value = e.currentTarget.value;
                setOpenaiDraft((prev) => ({ ...prev, prefix: value }));
              }}
              placeholder={t("providers.prefix_placeholder")}
            />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              {t("providers.priority_label")}
            </p>
            <TextInput
              value={openaiDraft.priorityText}
              onChange={(e) => {
                const value = e.currentTarget.value;
                setOpenaiDraft((prev) => ({ ...prev, priorityText: value }));
              }}
              placeholder={t("providers.priority_placeholder")}
              inputMode="numeric"
            />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              {t("providers.test_model_label")}
            </p>
            <TextInput
              value={openaiDraft.testModel}
              onChange={(e) => {
                const value = e.currentTarget.value;
                setOpenaiDraft((prev) => ({ ...prev, testModel: value }));
              }}
              placeholder={t("providers.test_model_placeholder")}
            />
          </div>
        </div>

        <div className="border-t border-slate-200/60 pt-5 dark:border-neutral-800/60">
          <KeyValueInputList
            title={t("providers.provider_headers")}
            entries={openaiDraft.headersEntries}
            onChange={(next) => setOpenaiDraft((prev) => ({ ...prev, headersEntries: next }))}
          />
        </div>

        <section className="space-y-2 border-t border-slate-200/60 pt-5 dark:border-neutral-800/60">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              {t("providers.api_key_entries")}
            </p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                setOpenaiDraft((prev) => ({
                  ...prev,
                  apiKeyEntries: [
                    ...prev.apiKeyEntries,
                    {
                      id: `key-${Date.now()}`,
                      apiKey: "",
                      proxyUrl: "",
                      proxyId: "",
                      headersEntries: [],
                    },
                  ],
                }))
              }
            >
              <Plus size={14} />
              {t("providers.add")}
            </Button>
          </div>

          <div className="space-y-3">
            {openaiDraft.apiKeyEntries.map((entry, idx) => (
              <div
                key={entry.id}
                className="rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    {t("providers.key_number", { num: idx + 1 })}
                  </p>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() =>
                      setOpenaiDraft((prev) => ({
                        ...prev,
                        apiKeyEntries: prev.apiKeyEntries.filter((_, i) => i !== idx),
                      }))
                    }
                    disabled={openaiDraft.apiKeyEntries.length <= 1}
                  >
                    <Trash2 size={14} />
                    {t("providers.delete")}
                  </Button>
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      {t("providers.api_key")}
                    </p>
                    <TextInput
                      value={entry.apiKey}
                      onChange={(e) => {
                        const value = e.currentTarget.value;
                        setOpenaiDraft((prev) => ({
                          ...prev,
                          apiKeyEntries: prev.apiKeyEntries.map((it, i) =>
                            i === idx ? { ...it, apiKey: value } : it,
                          ),
                        }));
                      }}
                      placeholder={t("providers.api_key_placeholder")}
                    />
                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-white/55">
                      <span>{t("providers.show_masked_key", { key: maskApiKey(entry.apiKey) })}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void copyText(entry.apiKey.trim())}
                        disabled={!entry.apiKey.trim()}
                      >
                        <Copy size={14} />
                        {t("providers.copy")}
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <ProxyPoolSelect
                      value={entry.proxyId}
                      entries={proxyPoolEntries}
                      onChange={(value) => {
                        setOpenaiDraft((prev) => ({
                          ...prev,
                          apiKeyEntries: prev.apiKeyEntries.map((it, i) =>
                            i === idx ? { ...it, proxyId: value } : it,
                          ),
                        }));
                      }}
                      label={t("providers.proxy_pool_label")}
                      hint={t("providers.proxy_pool_hint")}
                      ariaLabel={`${t("providers.proxy_pool_label")} ${idx + 1}`}
                    />
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      {t("providers.proxy_url_optional")}
                    </p>
                    <TextInput
                      value={entry.proxyUrl}
                      onChange={(e) => {
                        const value = e.currentTarget.value;
                        setOpenaiDraft((prev) => ({
                          ...prev,
                          apiKeyEntries: prev.apiKeyEntries.map((it, i) =>
                            i === idx ? { ...it, proxyUrl: value } : it,
                          ),
                        }));
                      }}
                      placeholder={t("providers.proxy_url_placeholder")}
                    />
                  </div>
                </div>

                <div className="mt-3">
                  <KeyValueInputList
                    title={t("providers.key_headers")}
                    entries={entry.headersEntries}
                    onChange={(next) => {
                      setOpenaiDraft((prev) => ({
                        ...prev,
                        apiKeyEntries: prev.apiKeyEntries.map((it, i) =>
                          i === idx ? { ...it, headersEntries: next } : it,
                        ),
                      }));
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-3 border-t border-slate-200/60 pt-5 dark:border-neutral-800/60">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              {t("providers.models_label")}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => void discoverModels()} disabled={discovering}>
                <RefreshCw size={14} className={discovering ? "animate-spin" : ""} />
                {t("providers.fetch_models")}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={applyDiscoveredModels}
                disabled={discoveredModels.length === 0}
              >
                <Check size={14} />
                {t("providers.merge_selected")}
              </Button>
            </div>
          </div>

          <ModelInputList
            title={t("providers.models_optional")}
            entries={openaiDraft.modelEntries}
            onChange={(next) => setOpenaiDraft((prev) => ({ ...prev, modelEntries: next }))}
            showPriority
            showTestModel
          />

          {discoveredModels.length ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4 dark:border-neutral-800 dark:bg-neutral-900/40">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-medium text-slate-700 dark:text-white/70">
                  {t("providers.found_models", { count: discoveredModels.length })}
                </p>
                <p className="text-xs tabular-nums text-slate-500 dark:text-white/50">
                  {t("providers.models_selected_count", { count: discoverSelected.size })}
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
                <Button variant="secondary" size="sm" onClick={deselectAllDiscovered}>
                  {t("providers.models_select_none")}
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
                aria-label={t("providers.found_models", { count: discoveredModels.length })}
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
                            onChange={() => {
                              setDiscoverSelected((prev) => {
                                const next = new Set(prev);
                                if (next.has(model.id)) next.delete(model.id);
                                else next.add(model.id);
                                return next;
                              });
                            }}
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
        </section>
      </div>
    </Modal>
  );
}
