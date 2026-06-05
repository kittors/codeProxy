import { useTranslation } from "react-i18next";
import { Copy, Plus, Trash2 } from "lucide-react";
import { Button } from "@code-proxy/ui";
import { TextInput } from "@code-proxy/ui";
import { ToggleSwitch } from "@code-proxy/ui";
import { KeyValueInputList } from "../KeyValueInputList";
import type { ProxyPoolEntry } from "@code-proxy/api-client/endpoints/proxies";
import { ProxyPoolSelect } from "@features/proxy-pool";
import type { OpenAIDraft } from "../providers-helpers";

const SectionCard = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
    {children}
  </div>
);

interface OpenAIKeyEntriesEditorProps {
  openaiDraft: OpenAIDraft;
  setOpenaiDraft: (value: React.SetStateAction<OpenAIDraft>) => void;
  proxyPoolEntries: ProxyPoolEntry[];
  copyText: (text: string) => Promise<void>;
  maskApiKey: (value: string) => string;
}

export function OpenAIKeyEntriesEditor({
  openaiDraft,
  setOpenaiDraft,
  proxyPoolEntries,
  copyText,
  maskApiKey,
}: OpenAIKeyEntriesEditorProps) {
  const { t } = useTranslation();

  return (
    <section className="space-y-2">
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
                  disabled: false,
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
          <SectionCard key={entry.id}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  {t("providers.key_number", { num: idx + 1 })}
                </p>
                <ToggleSwitch
                  checked={!entry.disabled}
                  ariaLabel={`${t("providers.enable_key_entry")} ${idx + 1}`}
                  onCheckedChange={(enabled) => {
                    setOpenaiDraft((prev) => ({
                      ...prev,
                      apiKeyEntries: prev.apiKeyEntries.map((it, i) =>
                        i === idx ? { ...it, disabled: !enabled } : it,
                      ),
                    }));
                  }}
                />
                <span className="text-xs font-semibold text-slate-500 dark:text-white/55">
                  {!entry.disabled ? t("providers.enabled") : t("providers.disabled")}
                </span>
              </div>
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
          </SectionCard>
        ))}
      </div>
    </section>
  );
}
