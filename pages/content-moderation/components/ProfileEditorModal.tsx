import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Ban, Bot, ListFilter, Server, ShieldCheck, Sparkles } from "lucide-react";
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
  Callout,
  ChoiceCards,
  Form,
  FormField,
  FormSection,
  Modal,
  SettingGroup,
  SettingRow,
  Textarea,
  TextInput,
  ToggleSwitch,
  rules,
  useFormValidation,
  type Rule,
} from "@code-proxy/ui";
import {
  createThresholdDraft,
  DEFAULT_THRESHOLDS,
  OpenAIThresholdFields,
  parseThresholds,
  thresholdValidationSchema,
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

export interface ProfileEditorModalProps {
  open: boolean;
  profile: ContentModerationProfileView | null;
  saving: boolean;
  onClose: () => void;
  onSave: (
    input: CreateContentModerationProfileInput | PatchContentModerationProfileInput,
  ) => Promise<void>;
}

/** 关键词模式需要至少一个拦截关键词（按与提交时相同的规则去重、去空后计数）。 */
const keywordsRule: Rule<string> = (value) =>
  parseKeywords(value).length > 0 ? null : { key: "required" };

/**
 * 新增 / 编辑审核配置。
 *
 * 以前四块灰底卡片没有标题，读不出每块在设置什么；现在按「是什么 → 怎么检查 → 调哪个服务 →
 * 分类怎么判 → 拦下后返回什么」分成带标题的分区。审核后端、检查策略、有争议内容的处理都改成卡片单选，
 * 选项的后果写在选项上；阈值和风险类别的说明常驻显示。校验规则与服务端一致，错误就地显示在对应字段下，
 * 提交时焦点跳到第一处错误——以前只在底部按钮旁显示第一条错误，长表单里要自己找是哪一项。
 */
export function ProfileEditorModal({
  open,
  profile,
  saving,
  onClose,
  onSave,
}: ProfileEditorModalProps) {
  const { t } = useTranslation();
  // Form 组件不转发 ref：用外层容器给 focusFirstInvalid 圈定查找范围。
  const formAreaRef = useRef<HTMLDivElement | null>(null);
  const [draft, setDraft] = useState<ModerationProfileDraft>(() => createDraft(profile));
  const [attempted, setAttempted] = useState(false);

  const apiModeEnabled = draft.keywordMode !== "keyword_only";
  const isGuard = draft.backend === "qwen3guard";
  // Self-hosted guard endpoints (vLLM, SGLang, Ollama) commonly run without
  // auth, so the key stays optional there while OpenAI still demands one.
  const apiKeyRequired = apiModeEnabled && !isGuard;
  const thresholdMode = apiModeEnabled && !isGuard;
  const apiKeyMissing =
    apiKeyRequired && !draft.apiKey.trim() && (!profile?.api_key_configured || draft.clearApiKey);

  const validation = useFormValidation(draft, {
    name: [rules.required()],
    timeoutMs: [rules.required(), rules.integer({ min: 1, max: 30000 })],
    blockHttpStatus: [rules.required(), rules.integer({ min: 400, max: 599 })],
    blockMessage: [rules.required()],
    baseUrl: apiModeEnabled ? [rules.required(), rules.url()] : undefined,
    model: apiModeEnabled ? [rules.required()] : undefined,
    // 要求有 Key 却勾了「清除」：输入框此时是禁用的，单说「必填」会让人不知道怎么改。
    apiKey: apiKeyMissing
      ? [() => ({ key: draft.clearApiKey ? "api_key_cleared_required" : "required" })]
      : undefined,
    blockedKeywordsText: draft.keywordMode !== "api_only" ? [keywordsRule] : undefined,
    inputLimit: isGuard ? [rules.required(), rules.integer({ min: 128, max: 100000 })] : undefined,
    maxChunks: isGuard ? [rules.required(), rules.integer({ min: 1, max: 32 })] : undefined,
  });
  const thresholdValidation = useFormValidation(
    draft.thresholds,
    thresholdMode ? thresholdValidationSchema : {},
  );
  const { reset } = validation;
  const { reset: resetThresholds } = thresholdValidation;

  useEffect(() => {
    if (!open) return;
    setDraft(createDraft(profile));
    setAttempted(false);
    reset();
    resetThresholds();
  }, [open, profile, reset, resetThresholds]);

  const configuredKeyLabel = useMemo(() => {
    if (!profile?.api_key_configured) return t("content_moderation.api_key_not_configured");
    return t("content_moderation.api_key_configured", {
      masked: profile.api_key_masked ?? "****",
    });
  }, [profile, t]);

  const update = (patch: Partial<ModerationProfileDraft>) =>
    setDraft((current) => ({ ...current, ...patch }));

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

  const issueCount =
    Object.keys(validation.issues).length + Object.keys(thresholdValidation.issues).length;

  const submit = async () => {
    setAttempted(true);
    // 两组都要调用：validate() 同时负责「把错误全部显示出来」。
    const fieldsValid = validation.validate();
    const thresholdsValid = thresholdValidation.validate();
    if (!fieldsValid || !thresholdsValid) {
      validation.focusFirstInvalid(formAreaRef.current);
      return;
    }
    const name = draft.name.trim();
    const baseUrl = draft.baseUrl.trim();
    const model = draft.model.trim();
    const apiKey = draft.apiKey.trim();
    const fixedThresholds = thresholdMode ? parseThresholds(draft.thresholds) : null;
    const shared = {
      name,
      backend: draft.backend,
      base_url: baseUrl,
      model,
      timeout_ms: Number(draft.timeoutMs),
      keyword_mode: draft.keywordMode,
      blocked_keywords: parseKeywords(draft.blockedKeywordsText),
      thresholds: fixedThresholds
        ? { ...profile?.thresholds, ...fixedThresholds }
        : (profile?.thresholds ?? DEFAULT_THRESHOLDS),
      scanners: draft.scanners,
      controversial_action: draft.controversialAction,
      elevated_categories: draft.elevatedCategories,
      input_limit: Number(draft.inputLimit),
      max_chunks: Number(draft.maxChunks),
      block_http_status: Number(draft.blockHttpStatus),
      block_message: draft.blockMessage.trim(),
    };

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
      icon={<ShieldCheck />}
      size="xl"
      bodyHeightClassName="max-h-[76vh]"
      footerStart={
        attempted && issueCount > 0 ? (
          <span className="text-rose-600 dark:text-rose-400">
            {t("validation.summary", { count: issueCount })}
          </span>
        ) : null
      }
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            {t("common.cancel")}
          </Button>
          <Button
            type="submit"
            form="content-moderation-profile-form"
            variant="primary"
            loading={saving}
          >
            {saving ? t("common.saving") : t("common.save")}
          </Button>
        </>
      }
    >
      <div ref={formAreaRef}>
      <Form
        id="content-moderation-profile-form"
        className="space-y-6"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <FormSection
          title={t("content_moderation.editor_section_basic")}
          description={t("content_moderation.editor_section_basic_desc")}
          icon={<ShieldCheck />}
        >
          <FormField
            label={t("content_moderation.profile_name")}
            required
            error={validation.error("name")}
          >
            <TextInput
              value={draft.name}
              autoComplete="off"
              {...validation.bind("name")}
              onChange={(event) => update({ name: event.currentTarget.value })}
            />
          </FormField>
          <FormField label={t("content_moderation.backend")} reserveMeta={false}>
            <ChoiceCards<ContentModerationBackend>
              value={draft.backend}
              onChange={switchBackend}
              options={[
                {
                  value: "openai_moderations",
                  label: t("content_moderation.backend_openai_moderations"),
                  description: t("content_moderation.backend_openai_moderations_desc"),
                  icon: <Sparkles />,
                },
                {
                  value: "qwen3guard",
                  label: t("content_moderation.backend_qwen3guard"),
                  description: t("content_moderation.backend_qwen3guard_desc"),
                  icon: <Bot />,
                },
              ]}
            />
          </FormField>
        </FormSection>

        <FormSection
          title={t("content_moderation.keyword_mode")}
          description={t("content_moderation.editor_section_strategy_desc")}
          icon={<ListFilter />}
        >
          <ChoiceCards<ContentModerationKeywordMode>
            ariaLabel={t("content_moderation.keyword_mode")}
            columns={3}
            value={draft.keywordMode}
            onChange={(keywordMode) => update({ keywordMode })}
            options={(["api_only", "keyword_only", "keyword_and_api"] as const).map((mode) => ({
              value: mode,
              label: t(`content_moderation.keyword_mode_${mode}`),
              description: t(`content_moderation.keyword_mode_${mode}_desc`),
            }))}
          />
          <FormField
            label={t("content_moderation.blocked_keywords")}
            description={t("content_moderation.blocked_keywords_hint")}
            required={draft.keywordMode !== "api_only"}
            optional={draft.keywordMode === "api_only"}
            error={validation.error("blockedKeywordsText")}
          >
            <Textarea
              value={draft.blockedKeywordsText}
              {...validation.bind("blockedKeywordsText")}
              onChange={(event) => update({ blockedKeywordsText: event.currentTarget.value })}
              placeholder={t("content_moderation.blocked_keywords_placeholder")}
              className="min-h-28 font-mono text-xs"
            />
          </FormField>
        </FormSection>

        <FormSection
          title={t("content_moderation.editor_section_service")}
          description={
            apiModeEnabled
              ? t("content_moderation.editor_section_service_desc")
              : t("content_moderation.editor_section_service_off")
          }
          icon={<Server />}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <FormField
              label={t("content_moderation.base_url")}
              description={isGuard ? t("content_moderation.base_url_guard_hint") : undefined}
              required={apiModeEnabled}
              error={validation.error("baseUrl")}
            >
              <TextInput
                value={draft.baseUrl}
                disabled={!apiModeEnabled}
                className="font-mono"
                spellCheck={false}
                placeholder={isGuard ? "http://127.0.0.1:8000" : OPENAI_DEFAULT_BASE_URL}
                aria-label={t("content_moderation.base_url")}
                {...validation.bind("baseUrl")}
                onChange={(event) => update({ baseUrl: event.currentTarget.value })}
              />
            </FormField>
            <FormField
              label={t("content_moderation.model")}
              required={apiModeEnabled}
              error={validation.error("model")}
            >
              <TextInput
                value={draft.model}
                disabled={!apiModeEnabled}
                className="font-mono"
                spellCheck={false}
                placeholder={isGuard ? "Qwen/Qwen3Guard-Gen-0.6B" : OPENAI_DEFAULT_MODEL}
                aria-label={t("content_moderation.model")}
                {...validation.bind("model")}
                onChange={(event) => update({ model: event.currentTarget.value })}
              />
            </FormField>
            <FormField
              label={t("content_moderation.api_key")}
              description={isGuard ? t("content_moderation.api_key_guard_hint") : configuredKeyLabel}
              required={apiKeyRequired && (!profile?.api_key_configured || draft.clearApiKey)}
              error={validation.error("apiKey")}
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
                // 占位文字不能顶替字段名（TextInput 没有 aria-label 时会拿占位文字当名字）。
                aria-label={t("content_moderation.api_key")}
                {...validation.bind("apiKey")}
                onChange={(event) => update({ apiKey: event.currentTarget.value })}
              />
            </FormField>
            <FormField
              label={t("content_moderation.timeout_ms")}
              required
              description={t("content_moderation.timeout_hint")}
              error={validation.error("timeoutMs")}
            >
              <TextInput
                value={draft.timeoutMs}
                inputMode="numeric"
                className="tabular-nums"
                {...validation.bind("timeoutMs")}
                onChange={(event) => update({ timeoutMs: event.currentTarget.value })}
              />
            </FormField>
          </div>
          {profile?.api_key_configured ? (
            <SettingGroup flat>
              <SettingRow
                label={t("content_moderation.clear_api_key")}
                description={t("content_moderation.clear_api_key_hint")}
                controlWidth="auto"
                control={
                  <ToggleSwitch
                    checked={draft.clearApiKey}
                    ariaLabel={t("content_moderation.clear_api_key")}
                    onCheckedChange={(clearApiKey) => update({ clearApiKey, apiKey: "" })}
                  />
                }
              />
            </SettingGroup>
          ) : null}
          <Callout tone="info">{t("content_moderation.fail_open_notice")}</Callout>
        </FormSection>

        {isGuard ? (
          <Qwen3GuardFields
            draft={draft}
            disabled={!apiModeEnabled}
            onChange={update}
            errors={{
              inputLimit: validation.error("inputLimit"),
              maxChunks: validation.error("maxChunks"),
            }}
            onFieldBlur={(field) => validation.touch(field)}
          />
        ) : (
          <OpenAIThresholdFields
            thresholds={draft.thresholds}
            disabled={!apiModeEnabled}
            onChange={(thresholds) => update({ thresholds })}
            errorFor={(key) => thresholdValidation.error(key)}
            onFieldBlur={(key) => thresholdValidation.touch(key)}
          />
        )}

        <FormSection
          title={t("content_moderation.editor_section_block")}
          description={t("content_moderation.editor_section_block_desc")}
          icon={<Ban />}
        >
          <div className="grid gap-4 md:grid-cols-[12rem_minmax(0,1fr)]">
            <FormField
              label={t("content_moderation.block_http_status")}
              required
              error={validation.error("blockHttpStatus")}
            >
              <TextInput
                value={draft.blockHttpStatus}
                inputMode="numeric"
                className="tabular-nums"
                {...validation.bind("blockHttpStatus")}
                onChange={(event) => update({ blockHttpStatus: event.currentTarget.value })}
              />
            </FormField>
            <FormField
              label={t("content_moderation.block_message")}
              required
              error={validation.error("blockMessage")}
            >
              <TextInput
                value={draft.blockMessage}
                {...validation.bind("blockMessage")}
                onChange={(event) => update({ blockMessage: event.currentTarget.value })}
              />
            </FormField>
          </div>
        </FormSection>
      </Form>
      </div>
    </Modal>
  );
}
