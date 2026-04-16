import type { Dispatch, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy } from "lucide-react";
import { Button } from "@/modules/ui/Button";
import { TextInput } from "@/modules/ui/Input";
import { Modal } from "@/modules/ui/Modal";
import { ToggleSwitch } from "@/modules/ui/ToggleSwitch";
import { KeyValueInputList } from "@/modules/providers/KeyValueInputList";
import { ModelInputList } from "@/modules/providers/ModelInputList";
import type { ProviderKeyDraft } from "@/modules/providers/providers-helpers";

interface ProviderKeyModalProps {
  open: boolean;
  editKeyIndex: number | null;
  editKeyTitle: string;
  editKeyType: "gemini" | "claude" | "codex" | "vertex";
  keyDraft: ProviderKeyDraft;
  setKeyDraft: Dispatch<SetStateAction<ProviderKeyDraft>>;
  keyDraftError: string | null;
  closeKeyEditor: () => void;
  saveKeyDraft: () => Promise<void>;
  editKeyEnabled: boolean;
  editKeyEnabledToggle: (checked: boolean) => void;
  editKeyHeaderCount: number;
  editKeyModelCount: number;
  editKeyExcludedCount: number;
  copyText: (text: string) => Promise<void>;
  maskApiKey: (value: string) => string;
}

export function ProviderKeyModal({
  open,
  editKeyIndex,
  editKeyTitle,
  editKeyType,
  keyDraft,
  setKeyDraft,
  keyDraftError,
  closeKeyEditor,
  saveKeyDraft,
  editKeyEnabled,
  editKeyEnabledToggle,
  editKeyHeaderCount,
  editKeyModelCount,
  editKeyExcludedCount,
  copyText,
  maskApiKey,
}: ProviderKeyModalProps) {
  const { t } = useTranslation();

  return (
    <Modal
      open={open}
      title={
        editKeyIndex === null
          ? t("providers.add_config", { type: editKeyTitle })
          : t("providers.edit_config", { type: editKeyTitle })
      }
      description={
        editKeyType === "vertex"
          ? t("providers.vertex_config_desc")
          : t("providers.generic_config_desc")
      }
      onClose={closeKeyEditor}
      footer={
        <div className="flex flex-wrap items-center gap-2">
          {keyDraftError ? (
            <span className="text-sm font-semibold text-rose-700 dark:text-rose-200">
              {keyDraftError}
            </span>
          ) : null}
          <Button variant="secondary" onClick={closeKeyEditor}>
            {t("providers.cancel")}
          </Button>
          <Button variant="primary" onClick={() => void saveKeyDraft()}>
            <Check size={14} />
            {t("providers.save")}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={
              editKeyEnabled
                ? "rounded-full bg-emerald-600/10 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200"
                : "rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:text-amber-200"
            }
          >
            {editKeyEnabled ? t("providers.enabled") : t("providers.disabled")}
          </span>
          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 dark:border-neutral-800 dark:bg-neutral-950/60 dark:text-white/75">
            {t("providers.headers_optional")}:{" "}
            <span className="font-semibold tabular-nums">{editKeyHeaderCount}</span>
          </span>
          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 dark:border-neutral-800 dark:bg-neutral-950/60 dark:text-white/75">
            {t("providers.models_label")}:{" "}
            <span className="font-semibold tabular-nums">{editKeyModelCount}</span>
          </span>
          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 dark:border-neutral-800 dark:bg-neutral-950/60 dark:text-white/75">
            {t("providers.excluded_models_label")}:{" "}
            <span className="font-semibold tabular-nums">{editKeyExcludedCount}</span>
          </span>
          {editKeyType === "vertex" ? (
            <span className="rounded-full bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white dark:bg-white dark:text-neutral-950">
              {t("providers.vertex_alias_required")}
            </span>
          ) : null}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">
            {t("providers.channel_name_label")}
          </p>
          <div className="mt-2">
            <TextInput
              value={keyDraft.name}
              onChange={(e) => {
                const val = e.currentTarget.value;
                setKeyDraft((prev) => ({ ...prev, name: val }));
              }}
              placeholder={t("providers.channel_placeholder")}
            />
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-white/55">
            {t("providers.channel_name_hint")}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
          <ToggleSwitch
            label={t("providers.enable")}
            description={
              editKeyEnabled
                ? t("providers.enable_toggle_desc_on")
                : t("providers.enable_toggle_desc_off")
            }
            checked={editKeyEnabled}
            onCheckedChange={editKeyEnabledToggle}
          />
          <p className="mt-2 text-xs text-slate-500 dark:text-white/55">
            {t("providers.disable_hint")}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              {t("providers.api_key")}
            </p>
            <span className="text-xs text-slate-500 dark:text-white/55">
              {t("providers.show_masked_key", { key: maskApiKey(keyDraft.apiKey) })}
            </span>
          </div>
          <div className="mt-2">
            <TextInput
              value={keyDraft.apiKey}
              onChange={(e) => {
                const val = e.currentTarget.value;
                setKeyDraft((prev) => ({ ...prev, apiKey: val }));
              }}
              placeholder={t("providers.paste_key")}
              endAdornment={
                <button
                  type="button"
                  onClick={() => void copyText(keyDraft.apiKey.trim())}
                  disabled={!keyDraft.apiKey.trim()}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white/80 text-slate-700 shadow-sm transition hover:bg-white disabled:opacity-50 dark:border-neutral-800 dark:bg-neutral-950/70 dark:text-slate-200 dark:hover:bg-neutral-950"
                  aria-label={t("providers.copy_api_key")}
                  title={t("providers.copy")}
                >
                  <Copy size={14} />
                </button>
              }
            />
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-white/55">
            {t("providers.api_key_hint")}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">
            {t("providers.prefix_label")}
          </p>
          <div className="mt-2">
            <TextInput
              value={keyDraft.prefix}
              onChange={(e) => {
                const val = e.currentTarget.value;
                setKeyDraft((prev) => ({ ...prev, prefix: val }));
              }}
              placeholder={t("providers.prefix_placeholder")}
            />
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-white/55">
            {t("providers.prefix_hint")}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">
            {t("providers.connection_proxy_label")}
          </p>
          <div className="mt-3 grid gap-3">
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-700 dark:text-white/75">
                {t("providers.base_url")}
              </p>
              <TextInput
                value={keyDraft.baseUrl}
                onChange={(e) => {
                  const val = e.currentTarget.value;
                  setKeyDraft((prev) => ({ ...prev, baseUrl: val }));
                }}
                placeholder={
                  editKeyType === "claude"
                    ? t("providers.claude_base_url_placeholder")
                    : t("providers.base_url_placeholder")
                }
              />
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-700 dark:text-white/75">
                {t("providers.proxy_url")}
              </p>
              <TextInput
                value={keyDraft.proxyUrl}
                onChange={(e) => {
                  const val = e.currentTarget.value;
                  setKeyDraft((prev) => ({ ...prev, proxyUrl: val }));
                }}
                placeholder={t("providers.proxy_url_placeholder")}
              />
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-white/55">
            {t("providers.connection_proxy_hint")}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
          <KeyValueInputList
            title={t("providers.headers_optional")}
            entries={keyDraft.headersEntries}
            onChange={(next) => setKeyDraft((prev) => ({ ...prev, headersEntries: next }))}
            keyPlaceholder={t("providers.header_name_placeholder")}
            valuePlaceholder={t("providers.header_value_placeholder")}
          />
          <p className="mt-2 text-xs text-slate-500 dark:text-white/55">
            {t("providers.headers_common_hint")}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
          <ModelInputList
            title={
              editKeyType === "vertex"
                ? t("providers.models_vertex_title")
                : t("providers.models_optional_title")
            }
            entries={keyDraft.modelEntries}
            onChange={(next) => setKeyDraft((prev) => ({ ...prev, modelEntries: next }))}
            showPriority
            showTestModel={false}
          />
          {editKeyType === "vertex" ? (
            <p className="mt-2 text-xs text-slate-500 dark:text-white/55">
              {t("providers.vertex_alias_hint")}
            </p>
          ) : (
            <p className="mt-2 text-xs text-slate-500 dark:text-white/55">
              {t("providers.models_default_hint")}
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              {t("providers.excluded_models_label")}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => editKeyEnabledToggle(false)}>
                {t("providers.add_disable_all")}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => editKeyEnabledToggle(true)}>
                {t("providers.remove_disable_all")}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setKeyDraft((prev) => ({ ...prev, excludedModelsText: "" }))}
              >
                {t("providers.clear")}
              </Button>
            </div>
          </div>

          <textarea
            value={keyDraft.excludedModelsText}
            onChange={(e) => {
              const val = e.currentTarget.value;
              setKeyDraft((prev) => ({ ...prev, excludedModelsText: val }));
            }}
            placeholder={t("providers.excluded_placeholder")}
            aria-label="excludedModels"
            className="mt-3 min-h-[140px] w-full resize-y rounded-2xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 outline-none transition placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-slate-400/35 dark:border-neutral-800 dark:bg-neutral-950 dark:text-slate-100 dark:placeholder:text-neutral-500 dark:focus-visible:ring-white/15"
          />

          <p className="mt-2 text-xs text-slate-500 dark:text-white/55">
            {t("providers.excluded_count_hint", { count: editKeyExcludedCount })}
          </p>
        </div>

        {editKeyType === "claude" ? (
          <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  {t("providers.anthropic_processing_label")}
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-white/55">
                  {t("providers.anthropic_processing_hint")}
                </p>
              </div>
              <ToggleSwitch
                checked={!keyDraft.skipAnthropicProcessing}
                onCheckedChange={(checked: boolean) =>
                  setKeyDraft((prev) => ({
                    ...prev,
                    skipAnthropicProcessing: !checked,
                  }))
                }
              />
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
