import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy, RefreshCw } from "lucide-react";
import { apiCallApi, getApiCallErrorMessage } from "@/lib/http/apis";
import type { ProxyPoolEntry } from "@/lib/http/apis/proxies";
import { Button } from "@/modules/ui/Button";
import { Checkbox } from "@/modules/ui/Checkbox";
import { TextInput } from "@/modules/ui/Input";
import { Modal } from "@/modules/ui/Modal";
import { SearchableSelect } from "@/modules/ui/SearchableSelect";
import { Select } from "@/modules/ui/Select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/modules/ui/Tabs";
import { ToggleSwitch } from "@/modules/ui/ToggleSwitch";
import { ProxyPoolSelect } from "@/modules/proxies/ProxyPoolSelect";
import { KeyValueInputList } from "@/modules/providers/KeyValueInputList";
import { ModelInputList } from "@/modules/providers/ModelInputList";
import type { ProviderKeyDraft } from "@/modules/providers/providers-helpers";
import {
  excludedModelsFromText,
  hasDisableAllModelsRule,
  normalizeDiscoveredModels,
  stripDisableAllModelsRule,
} from "@/modules/providers/providers-helpers";
import { modelsApi } from "@/lib/http/apis";
import type { ModelEntryDraft } from "@/modules/providers/ModelInputList";
import { createEmptyModelEntry } from "@/modules/providers/ModelInputList";

const OPENCODE_GO_MODELS_URL = "https://opencode.ai/zen/go/v1/models";
const OPENCODE_GO_CHAT_URL = "https://opencode.ai/zen/go/v1/chat/completions";
const OPENCODE_GO_MESSAGES_URL = "https://opencode.ai/zen/go/v1/messages";

type ProviderKeyModalTab = "basic" | "request" | "models";

interface ProviderKeyModalProps {
  open: boolean;
  editKeyIndex: number | null;
  editKeyTitle: string;
  editKeyType: "gemini" | "claude" | "codex" | "opencode-go" | "vertex" | "bedrock";
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
  proxyPoolEntries: ProxyPoolEntry[];
  copyText: (text: string) => Promise<void>;
  maskApiKey: (value: string) => string;
}

const SectionCard = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <div
    className={[
      "rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60",
      className,
    ]
      .filter(Boolean)
      .join(" ")}
  >
    {children}
  </div>
);

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
  proxyPoolEntries,
  copyText,
  maskApiKey,
}: ProviderKeyModalProps) {
  const { t } = useTranslation();
  const [modalTab, setModalTab] = useState<ProviderKeyModalTab>("basic");
  const [openCodeModels, setOpenCodeModels] = useState<{ id: string; owned_by?: string }[]>([]);
  const [openCodeModelsLoading, setOpenCodeModelsLoading] = useState(false);
  const [openCodeModelsError, setOpenCodeModelsError] = useState<string | null>(null);
  const [openCodeModelQuery, setOpenCodeModelQuery] = useState("");

  const isBedrock = editKeyType === "bedrock";
  const isBedrockSigV4 = isBedrock && keyDraft.authMode === "sigv4";
  const isOpenCodeGo = editKeyType === "opencode-go";

  /** 从 /model-configs API 动态获取模型列表，按 owned_by 分组 */
  const [modelConfigs, setModelConfigs] = useState<{ id: string; owned_by: string }[]>([]);
  const [modelConfigsLoading, setModelConfigsLoading] = useState(false);
  const [selectedModelGroup, setSelectedModelGroup] = useState("");

  const modelGroupOptions = useMemo(() => {
    const uniqueOwners = Array.from(
      new Set(modelConfigs.map((m) => m.owned_by).filter(Boolean)),
    ).sort((a, b) => a.localeCompare(b));
    return [
      { value: "", label: t("providers.model_group_placeholder") },
      ...uniqueOwners.map((owner) => ({ value: owner, label: owner })),
    ];
  }, [modelConfigs, t]);

  const loadModelsFromGroup = useCallback(() => {
    if (!selectedModelGroup) return;
    const models = modelConfigs.filter((m) => m.owned_by === selectedModelGroup);
    if (!models.length) return;

    const existingNames = new Set(
      keyDraft.modelEntries.map((e) => e.name.trim().toLowerCase()).filter(Boolean),
    );

    const newEntries: ModelEntryDraft[] = [];
    for (const model of models) {
      const name = model.id.trim();
      if (!name || existingNames.has(name.toLowerCase())) continue;
      existingNames.add(name.toLowerCase());
      newEntries.push({
        id: `model-${Date.now()}-${Math.random().toString(16).slice(2)}-${name}`,
        name,
        alias: "",
        priorityText: "",
        testModel: "",
      });
    }

    if (newEntries.length === 0) return;

    setKeyDraft((prev) => ({
      ...prev,
      modelEntries: [...prev.modelEntries, ...newEntries],
    }));
  }, [selectedModelGroup, modelConfigs, keyDraft.modelEntries, setKeyDraft]);

  useEffect(() => {
    if (!open) return;
    setModalTab("basic");
    setOpenCodeModelQuery("");
    setSelectedModelGroup("");
  }, [editKeyIndex, editKeyType, open]);

  useEffect(() => {
    if (!open || isOpenCodeGo) return;
    let cancelled = false;
    setModelConfigsLoading(true);
    modelsApi
      .getModelConfigs("library")
      .then((items) => {
        if (cancelled) return;
        setModelConfigs(items.map((item) => ({ id: item.id, owned_by: item.owned_by })));
      })
      .catch(() => {
        if (cancelled) return;
        setModelConfigs([]);
      })
      .finally(() => {
        if (!cancelled) setModelConfigsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, isOpenCodeGo]);

  const fetchOpenCodeModels = useCallback(async () => {
    if (!isOpenCodeGo) return;

    setOpenCodeModelsLoading(true);
    setOpenCodeModelsError(null);
    try {
      const result = await apiCallApi.request({
        method: "GET",
        url: OPENCODE_GO_MODELS_URL,
      });
      if (result.statusCode < 200 || result.statusCode >= 300) {
        throw new Error(getApiCallErrorMessage(result));
      }
      setOpenCodeModels(normalizeDiscoveredModels(result.body ?? result.bodyText));
    } catch (err: unknown) {
      setOpenCodeModelsError(
        err instanceof Error ? err.message : t("providers.fetch_models_failed"),
      );
    } finally {
      setOpenCodeModelsLoading(false);
    }
  }, [isOpenCodeGo, t]);

  useEffect(() => {
    if (!open || !isOpenCodeGo) return;
    void fetchOpenCodeModels();
  }, [fetchOpenCodeModels, isOpenCodeGo, open]);

  const excludedModels = useMemo(
    () => excludedModelsFromText(keyDraft.excludedModelsText),
    [keyDraft.excludedModelsText],
  );
  const disableAllModels = hasDisableAllModelsRule(excludedModels);
  const excludedModelIds = useMemo(
    () => new Set(stripDisableAllModelsRule(excludedModels).map((model) => model.toLowerCase())),
    [excludedModels],
  );
  const filteredOpenCodeModels = useMemo(() => {
    const query = openCodeModelQuery.trim().toLowerCase();
    if (!query) return openCodeModels;
    return openCodeModels.filter((model) => {
      const owner = (model.owned_by ?? "").toLowerCase();
      return model.id.toLowerCase().includes(query) || owner.includes(query);
    });
  }, [openCodeModelQuery, openCodeModels]);
  const allowedOpenCodeCount = openCodeModels.filter(
    (model) => !disableAllModels && !excludedModelIds.has(model.id.toLowerCase()),
  ).length;

  const setExcludedModels = useCallback(
    (next: string[]) => {
      const deduped = Array.from(new Set(next.map((model) => model.trim()).filter(Boolean)));
      setKeyDraft((prev) => ({ ...prev, excludedModelsText: deduped.join("\n") }));
    },
    [setKeyDraft],
  );

  const setOpenCodeModelAllowed = useCallback(
    (modelId: string, allowed: boolean) => {
      const normalized = modelId.toLowerCase();
      const fetchedIds = new Set(openCodeModels.map((model) => model.id.toLowerCase()));
      const current = stripDisableAllModelsRule(excludedModels);
      let next: string[];

      if (disableAllModels) {
        next = openCodeModels
          .map((model) => model.id)
          .filter((id) => id.toLowerCase() !== normalized);
      } else if (allowed) {
        next = current.filter((model) => model.toLowerCase() !== normalized);
      } else {
        next = [...current, modelId];
      }

      const unknownExisting = current.filter((model) => !fetchedIds.has(model.toLowerCase()));
      setExcludedModels([...unknownExisting, ...next]);
    },
    [disableAllModels, excludedModels, openCodeModels, setExcludedModels],
  );

  const setAllFetchedOpenCodeModelsAllowed = useCallback(
    (allowed: boolean) => {
      const fetchedIds = new Set(openCodeModels.map((model) => model.id.toLowerCase()));
      const unknownExisting = stripDisableAllModelsRule(excludedModels).filter(
        (model) => !fetchedIds.has(model.toLowerCase()),
      );
      setExcludedModels(
        allowed
          ? unknownExisting
          : [...unknownExisting, ...openCodeModels.map((model) => model.id)],
      );
    },
    [excludedModels, openCodeModels, setExcludedModels],
  );

  const statusBadges = (
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
      {isOpenCodeGo ? (
        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 dark:border-neutral-800 dark:bg-neutral-950/60 dark:text-white/75">
          {t("providers.models_allowed_count", {
            allowed: allowedOpenCodeCount,
            total: openCodeModels.length,
          })}
        </span>
      ) : (
        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 dark:border-neutral-800 dark:bg-neutral-950/60 dark:text-white/75">
          {t("providers.models_label")}:{" "}
          <span className="font-semibold tabular-nums">{editKeyModelCount}</span>
        </span>
      )}
      <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 dark:border-neutral-800 dark:bg-neutral-950/60 dark:text-white/75">
        {t("providers.excluded_models_label")}:{" "}
        <span className="font-semibold tabular-nums">{editKeyExcludedCount}</span>
      </span>
      {editKeyType === "vertex" ? (
        <span className="rounded-full bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white dark:bg-white dark:text-neutral-950">
          {t("providers.vertex_alias_required")}
        </span>
      ) : null}
      {isBedrock ? (
        <span className="rounded-full bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white dark:bg-white dark:text-neutral-950">
          {keyDraft.authMode === "sigv4"
            ? t("providers.bedrock_auth_sigv4")
            : t("providers.bedrock_auth_api_key")}
        </span>
      ) : null}
    </div>
  );

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
          : isBedrock
            ? t("providers.bedrock_config_desc")
            : isOpenCodeGo
              ? t("providers.opencode_go_config_desc")
              : t("providers.generic_config_desc")
      }
      onClose={closeKeyEditor}
      maxWidth="max-w-4xl"
      bodyHeightClassName="max-h-[74vh]"
      bodyClassName="!px-0 !py-0"
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
      <Tabs value={modalTab} onValueChange={(next) => setModalTab(next as ProviderKeyModalTab)}>
        <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-5 py-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/95">
          <TabsList>
            <TabsTrigger value="basic">{t("providers.modal_tab_basic")}</TabsTrigger>
            <TabsTrigger value="request">{t("providers.modal_tab_request")}</TabsTrigger>
            <TabsTrigger value="models">{t("providers.modal_tab_models")}</TabsTrigger>
          </TabsList>
        </div>

        <div className="px-5 py-4">
          <TabsContent value="basic" className="space-y-4">
            {statusBadges}

            <SectionCard>
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
            </SectionCard>

            <SectionCard>
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
            </SectionCard>

            {isBedrock ? (
              <SectionCard>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  {t("providers.bedrock_auth_mode")}
                </p>
                <div className="mt-2">
                  <Select
                    value={keyDraft.authMode}
                    onChange={(value) =>
                      setKeyDraft((prev) => ({
                        ...prev,
                        authMode: value === "sigv4" ? "sigv4" : "api-key",
                      }))
                    }
                    options={[
                      { value: "api-key", label: t("providers.bedrock_auth_api_key") },
                      { value: "sigv4", label: t("providers.bedrock_auth_sigv4") },
                    ]}
                    aria-label={t("providers.bedrock_auth_mode")}
                  />
                </div>
                <p className="mt-2 text-xs text-slate-500 dark:text-white/55">
                  {t("providers.bedrock_auth_mode_hint")}
                </p>
              </SectionCard>
            ) : null}

            {!isBedrockSigV4 ? (
              <SectionCard>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    {isBedrock ? t("providers.bedrock_auth_api_key") : t("providers.api_key")}
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
                  {isBedrock ? t("providers.bedrock_api_key_hint") : t("providers.api_key_hint")}
                </p>
              </SectionCard>
            ) : null}

            {isBedrockSigV4 ? (
              <SectionCard>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  {t("providers.bedrock_sigv4_credentials")}
                </p>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-slate-700 dark:text-white/75">
                      {t("providers.bedrock_access_key_id")}
                    </p>
                    <TextInput
                      value={keyDraft.accessKeyId}
                      onChange={(e) => {
                        const val = e.currentTarget.value;
                        setKeyDraft((prev) => ({ ...prev, accessKeyId: val }));
                      }}
                      placeholder="AKIA..."
                    />
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-slate-700 dark:text-white/75">
                      {t("providers.bedrock_secret_access_key")}
                    </p>
                    <TextInput
                      type="password"
                      value={keyDraft.secretAccessKey}
                      onChange={(e) => {
                        const val = e.currentTarget.value;
                        setKeyDraft((prev) => ({ ...prev, secretAccessKey: val }));
                      }}
                      placeholder={t("providers.bedrock_secret_placeholder")}
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <p className="text-xs font-semibold text-slate-700 dark:text-white/75">
                      {t("providers.bedrock_session_token")}
                    </p>
                    <TextInput
                      value={keyDraft.sessionToken}
                      onChange={(e) => {
                        const val = e.currentTarget.value;
                        setKeyDraft((prev) => ({ ...prev, sessionToken: val }));
                      }}
                      placeholder={t("providers.bedrock_session_placeholder")}
                    />
                  </div>
                </div>
                <p className="mt-2 text-xs text-slate-500 dark:text-white/55">
                  {t("providers.bedrock_sigv4_hint")}
                </p>
              </SectionCard>
            ) : null}

            <SectionCard>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
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
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    {t("providers.priority_label")}
                  </p>
                  <div className="mt-2">
                    <TextInput
                      value={keyDraft.priorityText}
                      onChange={(e) => {
                        const val = e.currentTarget.value;
                        setKeyDraft((prev) => ({ ...prev, priorityText: val }));
                      }}
                      placeholder={t("providers.priority_placeholder")}
                    />
                  </div>
                  <p className="mt-2 text-xs text-slate-500 dark:text-white/55">
                    {t("providers.priority_hint")}
                  </p>
                </div>
              </div>
            </SectionCard>
          </TabsContent>

          <TabsContent value="request" className="space-y-4">
            {isOpenCodeGo ? (
              <SectionCard className="bg-slate-50/80 dark:bg-neutral-900/50">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  {t("providers.opencode_go_fixed_endpoint_title")}
                </p>
                <div className="mt-3 grid gap-2 text-xs text-slate-600 dark:text-white/65">
                  <p className="font-mono">{OPENCODE_GO_CHAT_URL}</p>
                  <p className="font-mono">{OPENCODE_GO_MESSAGES_URL}</p>
                  <p className="font-mono">{OPENCODE_GO_MODELS_URL}</p>
                </div>
                <p className="mt-2 text-xs text-slate-500 dark:text-white/55">
                  {t("providers.opencode_go_fixed_endpoint_hint")}
                </p>
              </SectionCard>
            ) : null}

            {isBedrock ? (
              <SectionCard>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  {t("providers.bedrock_region")}
                </p>
                <div className="mt-2">
                  <TextInput
                    value={keyDraft.region}
                    onChange={(e) => {
                      const val = e.currentTarget.value;
                      setKeyDraft((prev) => ({ ...prev, region: val }));
                    }}
                    placeholder="us-east-1"
                  />
                </div>
                <div className="mt-3">
                  <ToggleSwitch
                    label={t("providers.bedrock_force_global")}
                    description={t("providers.bedrock_force_global_hint")}
                    checked={keyDraft.forceGlobal}
                    onCheckedChange={(checked: boolean) =>
                      setKeyDraft((prev) => ({ ...prev, forceGlobal: checked }))
                    }
                  />
                </div>
                <p className="mt-2 text-xs text-slate-500 dark:text-white/55">
                  {t("providers.bedrock_region_hint")}
                </p>
              </SectionCard>
            ) : null}

            <SectionCard>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                {t("providers.connection_proxy_label")}
              </p>
              <div className="mt-3 grid gap-3">
                {isOpenCodeGo ? null : (
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
                )}
                <div className="space-y-2">
                  <ProxyPoolSelect
                    value={keyDraft.proxyId}
                    entries={proxyPoolEntries}
                    onChange={(value) => setKeyDraft((prev) => ({ ...prev, proxyId: value }))}
                    label={t("providers.proxy_pool_label")}
                    hint={t("providers.proxy_pool_hint")}
                    ariaLabel={t("providers.proxy_pool_label")}
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
                {isOpenCodeGo
                  ? t("providers.opencode_go_connection_hint")
                  : t("providers.connection_proxy_hint")}
              </p>
            </SectionCard>

            <SectionCard>
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
            </SectionCard>

            {editKeyType === "claude" ? (
              <SectionCard>
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
              </SectionCard>
            ) : null}
          </TabsContent>

          <TabsContent value="models" className="space-y-4">
            {isOpenCodeGo ? (
              <SectionCard>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      {t("providers.opencode_go_models_title")}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-white/55">
                      {t("providers.opencode_go_models_hint")}
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void fetchOpenCodeModels()}
                    disabled={openCodeModelsLoading}
                  >
                    <RefreshCw size={14} className={openCodeModelsLoading ? "animate-spin" : ""} />
                    {t("providers.refresh")}
                  </Button>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <TextInput
                    value={openCodeModelQuery}
                    onChange={(e) => setOpenCodeModelQuery(e.currentTarget.value)}
                    placeholder={t("providers.models_search_placeholder")}
                    className="max-w-xs"
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setAllFetchedOpenCodeModelsAllowed(true)}
                    disabled={openCodeModels.length === 0}
                  >
                    {t("providers.models_select_all")}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setAllFetchedOpenCodeModelsAllowed(false)}
                    disabled={openCodeModels.length === 0}
                  >
                    {t("providers.models_select_none")}
                  </Button>
                  <span className="text-xs tabular-nums text-slate-500 dark:text-white/55">
                    {t("providers.models_allowed_count", {
                      allowed: allowedOpenCodeCount,
                      total: openCodeModels.length,
                    })}
                  </span>
                </div>

                {openCodeModelsError ? (
                  <p className="mt-3 rounded-2xl bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-700 dark:text-rose-200">
                    {openCodeModelsError}
                  </p>
                ) : null}

                <div className="mt-3 max-h-80 overflow-y-auto rounded-2xl border border-slate-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
                  {openCodeModelsLoading && openCodeModels.length === 0 ? (
                    <div className="px-3 py-6 text-center text-sm text-slate-500 dark:text-white/55">
                      {t("providers.models_loading")}
                    </div>
                  ) : filteredOpenCodeModels.length ? (
                    <div className="divide-y divide-slate-100 dark:divide-neutral-900">
                      {filteredOpenCodeModels.map((model) => {
                        const checked =
                          !disableAllModels && !excludedModelIds.has(model.id.toLowerCase());
                        return (
                          <label
                            key={model.id}
                            className="flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors hover:bg-slate-50 dark:hover:bg-white/5"
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(next) => setOpenCodeModelAllowed(model.id, next)}
                              aria-label={model.id}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-mono text-xs font-semibold text-slate-800 dark:text-white/85">
                                {model.id}
                              </span>
                              {model.owned_by ? (
                                <span className="block truncate text-[11px] text-slate-500 dark:text-white/45">
                                  {model.owned_by}
                                </span>
                              ) : null}
                            </span>
                            <span
                              className={
                                checked
                                  ? "rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-200"
                                  : "rounded-full bg-rose-500/10 px-2 py-0.5 text-[11px] font-semibold text-rose-700 dark:text-rose-200"
                              }
                            >
                              {checked
                                ? t("providers.model_allowed")
                                : t("providers.model_blocked")}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="px-3 py-6 text-center text-sm text-slate-500 dark:text-white/55">
                      {t("providers.no_discovered_models")}
                    </div>
                  )}
                </div>
              </SectionCard>
            ) : (
              <>
                <SectionCard>
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        {t("providers.model_group_label")}
                      </p>
                      <div className="mt-2">
                        <SearchableSelect
                          value={selectedModelGroup}
                          onChange={(value) => setSelectedModelGroup(value)}
                          options={modelGroupOptions}
                          placeholder={t("providers.model_group_placeholder")}
                          searchPlaceholder={t("providers.model_group_search_placeholder")}
                          aria-label={t("providers.model_group_label")}
                        />
                      </div>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={loadModelsFromGroup}
                      disabled={!selectedModelGroup || modelConfigsLoading}
                    >
                      {t("providers.load_models")}
                    </Button>
                  </div>
                  <p className="mt-2 text-xs text-slate-500 dark:text-white/55">
                    {t("providers.model_group_hint")}
                  </p>
                </SectionCard>

                <SectionCard>
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
                </SectionCard>

                <ExcludedModelsEditor
                  count={editKeyExcludedCount}
                  editKeyEnabledToggle={editKeyEnabledToggle}
                  keyDraft={keyDraft}
                  setKeyDraft={setKeyDraft}
                />
              </>
            )}
          </TabsContent>
        </div>
      </Tabs>
    </Modal>
  );
}

function ExcludedModelsEditor({
  count,
  editKeyEnabledToggle,
  keyDraft,
  setKeyDraft,
}: {
  count: number;
  editKeyEnabledToggle: (checked: boolean) => void;
  keyDraft: ProviderKeyDraft;
  setKeyDraft: Dispatch<SetStateAction<ProviderKeyDraft>>;
}) {
  const { t } = useTranslation();
  return (
    <SectionCard>
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
        {t("providers.excluded_count_hint", { count })}
      </p>
    </SectionCard>
  );
}
