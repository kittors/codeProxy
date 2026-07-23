import { useEffect, useMemo, useState } from "react";
import { Info } from "lucide-react";
import { useTranslation } from "react-i18next";
import type {
  ContentModerationKeywordMode,
  ContentModerationProfileView,
  CreateContentModerationProfileInput,
  PatchContentModerationProfileInput,
} from "@code-proxy/api-client";
import {
  Button,
  Form,
  FormField,
  HoverTooltip,
  Modal,
  Select,
  Textarea,
  TextInput,
  ToggleSwitch,
} from "@code-proxy/ui";

const THRESHOLD_CATEGORIES = [
  { key: "harassment", i18nKey: "harassment" },
  { key: "harassment/threatening", i18nKey: "harassment_threatening" },
  { key: "hate", i18nKey: "hate" },
  { key: "hate/threatening", i18nKey: "hate_threatening" },
  { key: "illicit", i18nKey: "illicit" },
  { key: "illicit/violent", i18nKey: "illicit_violent" },
  { key: "self-harm", i18nKey: "self_harm" },
  { key: "self-harm/intent", i18nKey: "self_harm_intent" },
  { key: "self-harm/instructions", i18nKey: "self_harm_instructions" },
  { key: "sexual", i18nKey: "sexual" },
  { key: "sexual/minors", i18nKey: "sexual_minors" },
  { key: "violence", i18nKey: "violence" },
  { key: "violence/graphic", i18nKey: "violence_graphic" },
] as const;

type ThresholdCategory = (typeof THRESHOLD_CATEGORIES)[number]["key"];

const DEFAULT_THRESHOLDS: Record<ThresholdCategory, number> = {
  harassment: 0.98,
  "harassment/threatening": 0.9,
  hate: 0.65,
  "hate/threatening": 0.65,
  illicit: 0.95,
  "illicit/violent": 0.95,
  "self-harm": 0.65,
  "self-harm/intent": 0.85,
  "self-harm/instructions": 0.65,
  sexual: 0.65,
  "sexual/minors": 0.65,
  violence: 0.95,
  "violence/graphic": 0.95,
};

const createThresholdDraft = (thresholds?: Record<string, number>): Record<string, string> => {
  const result: Record<string, string> = {};
  for (const { key } of THRESHOLD_CATEGORIES) {
    result[key] = String(thresholds?.[key] ?? DEFAULT_THRESHOLDS[key]);
  }
  return result;
};

export interface ModerationProfileDraft {
  name: string;
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
  baseUrl: profile?.base_url ?? "https://api.openai.com",
  model: profile?.model ?? "omni-moderation-latest",
  apiKey: "",
  clearApiKey: false,
  timeoutMs: String(profile?.timeout_ms ?? 3000),
  keywordMode: profile?.keyword_mode ?? "api_only",
  blockedKeywordsText: (profile?.blocked_keywords ?? []).join("\n"),
  thresholds: createThresholdDraft(profile?.thresholds),
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

const parseThresholds = (values: Record<string, string>): Record<string, number> | null => {
  const result: Record<string, number> = {};
  for (const { key } of THRESHOLD_CATEGORIES) {
    const rawValue = values[key];
    if (rawValue == null || rawValue.trim() === "") return null;

    const threshold = Number(rawValue);
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) return null;
    result[key] = threshold;
  }
  return result;
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
  const configuredKeyLabel = useMemo(() => {
    if (!profile?.api_key_configured) return t("content_moderation.api_key_not_configured");
    return t("content_moderation.api_key_configured", {
      masked: profile.api_key_masked ?? "****",
    });
  }, [profile, t]);

  const submit = async () => {
    const name = draft.name.trim();
    const baseUrl = draft.baseUrl.trim();
    const model = draft.model.trim();
    const apiKey = draft.apiKey.trim();
    const timeoutMs = Number(draft.timeoutMs);
    const blockHttpStatus = Number(draft.blockHttpStatus);
    const blockMessage = draft.blockMessage.trim();
    const blockedKeywords = parseKeywords(draft.blockedKeywordsText);
    const fixedThresholds = apiModeEnabled ? parseThresholds(draft.thresholds) : null;
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
    if (apiModeEnabled && !fixedThresholds) {
      setError(t("content_moderation.validation_thresholds"));
      return;
    }
    if (apiModeEnabled && !apiKey && (!profile?.api_key_configured || draft.clearApiKey)) {
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
      base_url: baseUrl,
      model,
      timeout_ms: timeoutMs,
      keyword_mode: draft.keywordMode,
      blocked_keywords: blockedKeywords,
      thresholds: apiModeEnabled
        ? { ...profile?.thresholds, ...fixedThresholds }
        : (profile?.thresholds ?? DEFAULT_THRESHOLDS),
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
        <section className="rounded-xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
          <FormField label={t("content_moderation.profile_name")} required reserveMeta={false}>
            <TextInput
              value={draft.name}
              onChange={(event) => {
                const name = event.currentTarget.value;
                setDraft((current) => ({ ...current, name }));
              }}
            />
          </FormField>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
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

        <section className="rounded-xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
          <div className="grid gap-4 md:grid-cols-2">
            <FormField
              label={t("content_moderation.base_url")}
              required={apiModeEnabled}
              reserveMeta={false}
            >
              <TextInput
                value={draft.baseUrl}
                disabled={!apiModeEnabled}
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
              description={configuredKeyLabel}
              required={apiModeEnabled && (!profile?.api_key_configured || draft.clearApiKey)}
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

          <div className="mt-5 border-t border-slate-200 pt-4 dark:border-neutral-800">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                {t("content_moderation.thresholds")}
              </h3>
              <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-white/45">
                {t("content_moderation.thresholds_hint")}
              </p>
            </div>
            <div className="grid gap-x-4 gap-y-3 md:grid-cols-2">
              {THRESHOLD_CATEGORIES.map(({ key, i18nKey }) => {
                const categoryName = t(`content_moderation.threshold_category.${i18nKey}`);
                const categoryHelp = t(`content_moderation.threshold_category_help.${i18nKey}`);
                return (
                  <FormField
                    key={key}
                    label={
                      <span className="inline-flex items-center gap-1.5">
                        <span>{categoryName}</span>
                        <HoverTooltip content={categoryHelp} placement="top">
                          <span
                            role="button"
                            tabIndex={0}
                            aria-label={categoryHelp}
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                            }}
                            className="inline-flex h-5 w-5 items-center justify-center rounded-full text-slate-400 transition hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/35 dark:text-white/40 dark:hover:text-white/75 dark:focus-visible:ring-white/15"
                          >
                            <Info size={14} aria-hidden="true" />
                          </span>
                        </HoverTooltip>
                      </span>
                    }
                    required={apiModeEnabled}
                    reserveMeta={false}
                  >
                    <TextInput
                      type="number"
                      min="0"
                      max="1"
                      step="0.01"
                      inputMode="decimal"
                      aria-label={categoryName}
                      value={draft.thresholds[key] ?? ""}
                      disabled={!apiModeEnabled}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        setDraft((current) => ({
                          ...current,
                          thresholds: { ...current.thresholds, [key]: value },
                        }));
                      }}
                    />
                  </FormField>
                );
              })}
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
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
