import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  ContentModerationKeywordMode,
  ContentModerationMode,
  ContentModerationProfileView,
  CreateContentModerationProfileInput,
  PatchContentModerationProfileInput,
} from "@code-proxy/api-client";
import { Button, Modal, Select, Textarea, TextInput, ToggleSwitch } from "@code-proxy/ui";

const DEFAULT_THRESHOLDS: Record<string, number> = {
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

export interface ModerationProfileDraft {
  name: string;
  mode: ContentModerationMode;
  baseUrl: string;
  model: string;
  apiKey: string;
  clearApiKey: boolean;
  timeoutMs: string;
  keywordMode: ContentModerationKeywordMode;
  blockedKeywordsText: string;
  thresholdsText: string;
  blockHttpStatus: string;
  blockMessage: string;
}

const formatThresholds = (thresholds: Record<string, number>) =>
  Object.entries(thresholds)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([category, threshold]) => `${category}=${threshold}`)
    .join("\n");

const createDraft = (profile: ContentModerationProfileView | null): ModerationProfileDraft => ({
  name: profile?.name ?? "",
  mode: profile?.mode ?? "off",
  baseUrl: profile?.base_url ?? "https://api.openai.com",
  model: profile?.model ?? "omni-moderation-latest",
  apiKey: "",
  clearApiKey: false,
  timeoutMs: String(profile?.timeout_ms ?? 3000),
  keywordMode: profile?.keyword_mode ?? "api_only",
  blockedKeywordsText: (profile?.blocked_keywords ?? []).join("\n"),
  thresholdsText: formatThresholds(profile?.thresholds ?? DEFAULT_THRESHOLDS),
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

export function parseThresholds(value: string): Record<string, number> | null {
  const result: Record<string, number> = {};
  for (const rawLine of value.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const separator = line.includes("=") ? "=" : ":";
    const index = line.indexOf(separator);
    if (index <= 0) return null;
    const category = line.slice(0, index).trim();
    const threshold = Number(line.slice(index + 1).trim());
    if (!category || !Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
      return null;
    }
    result[category] = threshold;
  }
  return result;
}

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
    const timeoutMs = Number(draft.timeoutMs);
    const blockHttpStatus = Number(draft.blockHttpStatus);
    const thresholds = parseThresholds(draft.thresholdsText);
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
    if (!thresholds) {
      setError(t("content_moderation.validation_thresholds"));
      return;
    }

    const shared = {
      name,
      mode: draft.mode,
      base_url: draft.baseUrl.trim(),
      model: draft.model.trim(),
      timeout_ms: timeoutMs,
      keyword_mode: draft.keywordMode,
      blocked_keywords: parseKeywords(draft.blockedKeywordsText),
      thresholds,
      block_http_status: blockHttpStatus,
      block_message: draft.blockMessage.trim(),
    };

    setError("");
    if (profile) {
      await onSave({
        ...shared,
        version: profile.version,
        ...(draft.apiKey.trim() ? { api_key: draft.apiKey.trim() } : {}),
        ...(draft.clearApiKey ? { clear_api_key: true } : {}),
      });
      return;
    }
    await onSave({
      ...shared,
      ...(draft.apiKey.trim() ? { api_key: draft.apiKey.trim() } : {}),
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
            <span className="mr-auto text-sm font-semibold text-rose-700 dark:text-rose-200">
              {error}
            </span>
          ) : null}
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" onClick={() => void submit()} disabled={saving}>
            {saving ? t("common.saving") : t("common.save")}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <section className="rounded-xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-900 dark:text-white">
                {t("content_moderation.profile_name")}
              </span>
              <TextInput
                value={draft.name}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, name: event.currentTarget.value }))
                }
              />
            </label>
            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                {t("content_moderation.mode")}
              </p>
              <Select
                value={draft.mode}
                onChange={(value) => {
                  if (value !== "off" && value !== "pre_block") return;
                  setDraft((current) => ({ ...current, mode: value }));
                }}
                options={[
                  { value: "off", label: t("content_moderation.mode_off") },
                  { value: "pre_block", label: t("content_moderation.mode_pre_block") },
                ]}
                aria-label={t("content_moderation.mode")}
              />
            </div>
          </div>
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
            {t("content_moderation.fail_open_notice")}
          </p>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-900 dark:text-white">
                {t("content_moderation.keyword_mode")}
              </span>
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
                aria-label={t("content_moderation.keyword_mode")}
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-900 dark:text-white">
                {t("content_moderation.timeout_ms")}
              </span>
              <TextInput
                value={draft.timeoutMs}
                inputMode="numeric"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    timeoutMs: event.currentTarget.value,
                  }))
                }
              />
            </label>
          </div>

          <label className="mt-4 block space-y-2">
            <span className="text-sm font-semibold text-slate-900 dark:text-white">
              {t("content_moderation.blocked_keywords")}
            </span>
            <Textarea
              value={draft.blockedKeywordsText}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  blockedKeywordsText: event.currentTarget.value,
                }))
              }
              placeholder={t("content_moderation.blocked_keywords_placeholder")}
              className="min-h-28 font-mono text-xs"
            />
            <span className="text-xs text-slate-500 dark:text-white/55">
              {t("content_moderation.blocked_keywords_hint")}
            </span>
          </label>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-900 dark:text-white">
                {t("content_moderation.base_url")}
              </span>
              <TextInput
                value={draft.baseUrl}
                disabled={!apiModeEnabled}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, baseUrl: event.currentTarget.value }))
                }
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-900 dark:text-white">
                {t("content_moderation.model")}
              </span>
              <TextInput
                value={draft.model}
                disabled={!apiModeEnabled}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, model: event.currentTarget.value }))
                }
              />
            </label>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-900 dark:text-white">
                {t("content_moderation.api_key")}
              </span>
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
                onChange={(event) =>
                  setDraft((current) => ({ ...current, apiKey: event.currentTarget.value }))
                }
              />
              <span className="text-xs text-slate-500 dark:text-white/55">
                {configuredKeyLabel}
              </span>
            </label>
            {profile?.api_key_configured ? (
              <div className="space-y-2 pt-7">
                <ToggleSwitch
                  checked={draft.clearApiKey}
                  onCheckedChange={(clearApiKey) =>
                    setDraft((current) => ({ ...current, clearApiKey, apiKey: "" }))
                  }
                  label={t("content_moderation.clear_api_key")}
                />
              </div>
            ) : null}
          </div>

          <label className="mt-4 block space-y-2">
            <span className="text-sm font-semibold text-slate-900 dark:text-white">
              {t("content_moderation.thresholds")}
            </span>
            <Textarea
              value={draft.thresholdsText}
              disabled={!apiModeEnabled}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  thresholdsText: event.currentTarget.value,
                }))
              }
              className="min-h-48 font-mono text-xs"
            />
            <span className="text-xs text-slate-500 dark:text-white/55">
              {t("content_moderation.thresholds_hint")}
            </span>
          </label>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
          <div className="grid gap-4 md:grid-cols-[180px_minmax(0,1fr)]">
            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-900 dark:text-white">
                {t("content_moderation.block_http_status")}
              </span>
              <TextInput
                value={draft.blockHttpStatus}
                inputMode="numeric"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    blockHttpStatus: event.currentTarget.value,
                  }))
                }
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-900 dark:text-white">
                {t("content_moderation.block_message")}
              </span>
              <TextInput
                value={draft.blockMessage}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    blockMessage: event.currentTarget.value,
                  }))
                }
              />
            </label>
          </div>
        </section>
      </div>
    </Modal>
  );
}
