import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  ContentModerationBackend,
  ContentModerationKeywordMode,
  ContentModerationProfileView,
  ContentModerationScanner,
  CreateContentModerationProfileInput,
  PatchContentModerationProfileInput,
} from "@code-proxy/api-client";
import {
  Button,
  Form,
  FormField,
  Modal,
  Select,
  Textarea,
  surface,
  TextInput,
  ToggleSwitch,
} from "@code-proxy/ui";
import {
  createThresholdDraft,
  DEFAULT_THRESHOLDS,
  OpenAIThresholdFields,
  parseThresholds,
} from "./editor/OpenAIThresholdFields";
import { Qwen3GuardFields, type Qwen3GuardDraft } from "./editor/Qwen3GuardFields";

const OPENAI_DEFAULT_BASE_URL = "https://api.openai.com";
const OPENAI_DEFAULT_MODEL = "omni-moderation-latest";
const GUARD_DEFAULT_ELEVATED: ContentModerationScanner[] = [
  "pii",
  "suicide_and_self_harm",
  "jailbreak",
];

export interface ModerationProfileDraft extends Qwen3GuardDraft {
  name: string;
  backend: ContentModerationBackend;
  baseUrl: string;
  model: string;
  apiKey: string;
  clearApiKey: boolean;
  timeoutMs: string;
  keywordMode: ContentModerationKeywordMode;
  blockedKeywordsText: string;
  thresholds: Record<string, string>;
  blockHttpStatus: string;
  blockMessage: string;
}

const createDraft = (profile: ContentModerationProfileView | null): ModerationProfileDraft => ({
  name: profile?.name ?? "",
  backend: profile?.backend ?? "openai_moderations",
  baseUrl: profile?.base_url ?? OPENAI_DEFAULT_BASE_URL,
  model: profile?.model ?? OPENAI_DEFAULT_MODEL,
  apiKey: "",
  clearApiKey: false,
  timeoutMs: String(profile?.timeout_ms ?? 3000),
  keywordMode: profile?.keyword_mode ?? "api_only",
  blockedKeywordsText: (profile?.blocked_keywords ?? []).join("\n"),
  thresholds: createThresholdDraft(profile?.thresholds),
  scanners: profile?.scanners ?? [],
  controversialAction: profile?.controversial_action ?? "elevated_only",
  elevatedCategories: profile?.elevated_categories ?? GUARD_DEFAULT_ELEVATED,
  inputLimit: String(profile?.input_limit ?? 4000),
  maxChunks: String(profile?.max_chunks ?? 4),
  blockHttpStatus: String(profile?.block_http_status ?? 403),
  blockMessage:
    profile?.block_message ?? "Your request was blocked by the content moderation policy.",
});

const parseKeywords = (value: string) => {
  const seen = new Set<string>();
  const keywords: string[] = [];
  for (const item of value.split(/[\n,]+/)) {
    const keyword = item.trim();
    const key = keyword.toLowerCase();
    if (!keyword || seen.has(key)) continue;
    seen.add(key);
    keywords.push(keyword);
  }
  return keywords;
};

const isAbsoluteHttpUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

export interface ProfileEditorModalProps {
  open: boolean;
  profile: ContentModerationProfileView | null;
  saving: boolean;
  onClose: () => void;
  onSave: (
    input: CreateContentModerationProfileInput | PatchContentModerationProfileInput,
  ) => Promise<void>;
}

export function ProfileEditorModal({
  open,
  profile,
  saving,
  onClose,
  onSave,
}: ProfileEditorModalProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<ModerationProfileDraft>(() => createDraft(profile));
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setDraft(createDraft(profile));
    setError("");
  }, [open, profile]);

  const apiModeEnabled = draft.keywordMode !== "keyword_only";
  const isGuard = draft.backend === "qwen3guard";
  // Self-hosted guard endpoints (vLLM, SGLang, Ollama) commonly run without
  // auth, so the key stays optional there while OpenAI still demands one.
  const apiKeyRequired = apiModeEnabled && !isGuard;
  const configuredKeyLabel = useMemo(() => {
    if (!profile?.api_key_configured) return t("content_moderation.api_key_not_configured");
    return t("content_moderation.api_key_configured", {
      masked: profile.api_key_masked ?? "****",
    });
  }, [profile, t]);

  const switchBackend = (backend: ContentModerationBackend) => {
    setDraft((current) => {
      if (current.backend === backend) return current;
      // Endpoint defaults are swapped only while the operator is still on the
      // other backend's untouched defaults, so switching never eats typed input.
      const onOpenAIDefaults =
        current.baseUrl.trim() === OPENAI_DEFAULT_BASE_URL &&
        current.model.trim() === OPENAI_DEFAULT_MODEL;
      if (backend === "qwen3guard" && onOpenAIDefaults) {
        return { ...current, backend, baseUrl: "", model: "" };
      }
      if (backend === "openai_moderations" && !current.baseUrl.trim() && !current.model.trim()) {
        return {
          ...current,
          backend,
          baseUrl: OPENAI_DEFAULT_BASE_URL,
          model: OPENAI_DEFAULT_MODEL,
        };
      }
      return { ...current, backend };
    });
  };

  const submit = async () => {
    const name = draft.name.trim();
    const baseUrl = draft.baseUrl.trim();
    const model = draft.model.trim();
    const apiKey = draft.apiKey.trim();
    const timeoutMs = Number(draft.timeoutMs);
    const inputLimit = Number(draft.inputLimit);
    const maxChunks = Number(draft.maxChunks);
    const blockHttpStatus = Number(draft.blockHttpStatus);
    const blockMessage = draft.blockMessage.trim();
    const blockedKeywords = parseKeywords(draft.blockedKeywordsText);
    const thresholdMode = apiModeEnabled && !isGuard;
    const fixedThresholds = thresholdMode ? parseThresholds(draft.thresholds) : null;
    if (!name) {
      setError(t("content_moderation.validation_name"));
      return;
    }
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) {
      setError(t("content_moderation.validation_timeout"));
      return;
    }
    if (!Number.isInteger(blockHttpStatus) || blockHttpStatus < 400 || blockHttpStatus > 599) {
      setError(t("content_moderation.validation_status"));
      return;
    }
    if (apiModeEnabled && !baseUrl) {
      setError(t("content_moderation.validation_base_url_required"));
      return;
    }
    if (apiModeEnabled && !isAbsoluteHttpUrl(baseUrl)) {
      setError(t("content_moderation.validation_base_url_invalid"));
      return;
    }
    if (apiModeEnabled && !model) {
      setError(t("content_moderation.validation_model"));
      return;
    }
    if (thresholdMode && !fixedThresholds) {
      setError(t("content_moderation.validation_thresholds"));
      return;
    }
    if (isGuard && (!Number.isInteger(inputLimit) || inputLimit < 128 || inputLimit > 100000)) {
      setError(t("content_moderation.validation_input_limit"));
      return;
    }
    if (isGuard && (!Number.isInteger(maxChunks) || maxChunks < 1 || maxChunks > 32)) {
      setError(t("content_moderation.validation_max_chunks"));
      return;
    }
    if (apiKeyRequired && !apiKey && (!profile?.api_key_configured || draft.clearApiKey)) {
      setError(t("content_moderation.validation_api_key"));
      return;
    }
    if (!blockMessage) {
      setError(t("content_moderation.validation_block_message"));
      return;
    }
    if (draft.keywordMode !== "api_only" && blockedKeywords.length === 0) {
      setError(t("content_moderation.validation_keywords"));
      return;
    }

    const shared = {
      name,
      backend: draft.backend,
      base_url: baseUrl,
      model,
      timeout_ms: timeoutMs,
      keyword_mode: draft.keywordMode,
      blocked_keywords: blockedKeywords,
      thresholds: fixedThresholds
        ? { ...profile?.thresholds, ...fixedThresholds }
        : (profile?.thresholds ?? DEFAULT_THRESHOLDS),
      scanners: draft.scanners,
      controversial_action: draft.controversialAction,
      elevated_categories: draft.elevatedCategories,
      input_limit: inputLimit,
      max_chunks: maxChunks,
      block_http_status: blockHttpStatus,
      block_message: blockMessage,
    };

    setError("");
    if (profile) {
      await onSave({
        ...shared,
        version: profile.version,
        ...(apiKey ? { api_key: apiKey } : {}),
        ...(draft.clearApiKey ? { clear_api_key: true } : {}),
      });
      return;
    }
    await onSave({
      ...shared,
      mode: "off",
      ...(apiKey ? { api_key: apiKey } : {}),
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        profile ? t("content_moderation.edit_profile") : t("content_moderation.create_profile")
      }
      description={t("content_moderation.editor_description")}
      maxWidth="max-w-4xl"
      bodyHeightClassName="max-h-[76vh]"
      footer={
        <>
          {error ? (
            <span
              role="alert"
              className="mr-auto text-sm font-semibold text-rose-700 dark:text-rose-200"
            >
              {error}
            </span>
          ) : null}
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            {t("common.cancel")}
          </Button>
          <Button
            type="submit"
            form="content-moderation-profile-form"
            variant="primary"
            disabled={saving}
          >
            {saving ? t("common.saving") : t("common.save")}
          </Button>
        </>
      }
    >
      <Form
        id="content-moderation-profile-form"
        className="space-y-5"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <section className={[surface({ tone: "raised", radius: "xl" }), "p-4"].join(" ")}>
          <div className="grid gap-4 md:grid-cols-2">
            <FormField label={t("content_moderation.profile_name")} required reserveMeta={false}>
              <TextInput
                value={draft.name}
                onChange={(event) => {
                  const name = event.currentTarget.value;
                  setDraft((current) => ({ ...current, name }));
                }}
              />
            </FormField>
            <FormField
              label={t("content_moderation.backend")}
              description={t("content_moderation.backend_hint")}
              reserveMeta={false}
            >
              <Select
                value={draft.backend}
                onChange={(value) => {
                  if (value !== "openai_moderations" && value !== "qwen3guard") return;
                  switchBackend(value);
                }}
                options={[
                  {
                    value: "openai_moderations",
                    label: t("content_moderation.backend_openai_moderations"),
                  },
                  { value: "qwen3guard", label: t("content_moderation.backend_qwen3guard") },
                ]}
              />
            </FormField>
          </div>
        </section>

        <section className={[surface({ tone: "raised", radius: "xl" }), "p-4"].join(" ")}>
          <div className="grid gap-4 md:grid-cols-2">
            <FormField label={t("content_moderation.keyword_mode")} reserveMeta={false}>
              <Select
                value={draft.keywordMode}
                onChange={(value) => {
                  if (
                    value !== "api_only" &&
                    value !== "keyword_only" &&
                    value !== "keyword_and_api"
                  ) {
                    return;
                  }
                  setDraft((current) => ({ ...current, keywordMode: value }));
                }}
                options={[
                  { value: "api_only", label: t("content_moderation.keyword_mode_api_only") },
                  {
                    value: "keyword_only",
                    label: t("content_moderation.keyword_mode_keyword_only"),
                  },
                  {
                    value: "keyword_and_api",
                    label: t("content_moderation.keyword_mode_keyword_and_api"),
                  },
                ]}
              />
            </FormField>
            <FormField label={t("content_moderation.timeout_ms")} required reserveMeta={false}>
              <TextInput
                value={draft.timeoutMs}
                inputMode="numeric"
                onChange={(event) => {
                  const timeoutMs = event.currentTarget.value;
                  setDraft((current) => ({ ...current, timeoutMs }));
                }}
              />
            </FormField>
          </div>

          <FormField
            className="mt-4"
            label={t("content_moderation.blocked_keywords")}
            description={t("content_moderation.blocked_keywords_hint")}
            required={draft.keywordMode !== "api_only"}
            reserveMeta={false}
          >
            <Textarea
              value={draft.blockedKeywordsText}
              onChange={(event) => {
                const blockedKeywordsText = event.currentTarget.value;
                setDraft((current) => ({ ...current, blockedKeywordsText }));
              }}
              placeholder={t("content_moderation.blocked_keywords_placeholder")}
              className="min-h-28 font-mono text-xs"
            />
          </FormField>
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
            {t("content_moderation.fail_open_notice")}
          </p>
        </section>

        <section className={[surface({ tone: "raised", radius: "xl" }), "p-4"].join(" ")}>
          <div className="grid gap-4 md:grid-cols-2">
            <FormField
              label={t("content_moderation.base_url")}
              description={isGuard ? t("content_moderation.base_url_guard_hint") : undefined}
              required={apiModeEnabled}
              reserveMeta={false}
            >
              <TextInput
                value={draft.baseUrl}
                disabled={!apiModeEnabled}
                placeholder={isGuard ? "http://127.0.0.1:8000" : OPENAI_DEFAULT_BASE_URL}
                onChange={(event) => {
                  const baseUrl = event.currentTarget.value;
                  setDraft((current) => ({ ...current, baseUrl }));
                }}
              />
            </FormField>
            <FormField
              label={t("content_moderation.model")}
              required={apiModeEnabled}
              reserveMeta={false}
            >
              <TextInput
                value={draft.model}
                disabled={!apiModeEnabled}
                placeholder={isGuard ? "Qwen/Qwen3Guard-Gen-0.6B" : OPENAI_DEFAULT_MODEL}
                onChange={(event) => {
                  const model = event.currentTarget.value;
                  setDraft((current) => ({ ...current, model }));
                }}
              />
            </FormField>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <FormField
              label={t("content_moderation.api_key")}
              description={isGuard ? t("content_moderation.api_key_guard_hint") : configuredKeyLabel}
              required={apiKeyRequired && (!profile?.api_key_configured || draft.clearApiKey)}
              reserveMeta={false}
            >
              <TextInput
                type="password"
                autoComplete="new-password"
                value={draft.apiKey}
                disabled={!apiModeEnabled || draft.clearApiKey}
                placeholder={
                  profile?.api_key_configured
                    ? t("content_moderation.api_key_keep_placeholder")
                    : t("content_moderation.api_key_placeholder")
                }
                onChange={(event) => {
                  const apiKey = event.currentTarget.value;
                  setDraft((current) => ({ ...current, apiKey }));
                }}
              />
            </FormField>
            {profile?.api_key_configured ? (
              <FormField label={t("content_moderation.clear_api_key")} reserveMeta={false}>
                <ToggleSwitch
                  checked={draft.clearApiKey}
                  onCheckedChange={(clearApiKey) =>
                    setDraft((current) => ({ ...current, clearApiKey, apiKey: "" }))
                  }
                />
              </FormField>
            ) : null}
          </div>

          {isGuard ? (
            <Qwen3GuardFields
              draft={draft}
              disabled={!apiModeEnabled}
              onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
            />
          ) : (
            <OpenAIThresholdFields
              thresholds={draft.thresholds}
              disabled={!apiModeEnabled}
              onChange={(thresholds) => setDraft((current) => ({ ...current, thresholds }))}
            />
          )}
        </section>

        <section className={[surface({ tone: "raised", radius: "xl" }), "p-4"].join(" ")}>
          <div className="grid gap-4 md:grid-cols-[180px_minmax(0,1fr)]">
            <FormField
              label={t("content_moderation.block_http_status")}
              required
              reserveMeta={false}
            >
              <TextInput
                value={draft.blockHttpStatus}
                inputMode="numeric"
                onChange={(event) => {
                  const blockHttpStatus = event.currentTarget.value;
                  setDraft((current) => ({ ...current, blockHttpStatus }));
                }}
              />
            </FormField>
            <FormField label={t("content_moderation.block_message")} required reserveMeta={false}>
              <TextInput
                value={draft.blockMessage}
                onChange={(event) => {
                  const blockMessage = event.currentTarget.value;
                  setDraft((current) => ({ ...current, blockMessage }));
                }}
              />
            </FormField>
          </div>
        </section>
      </Form>
    </Modal>
  );
}
