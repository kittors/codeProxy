import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Play } from "lucide-react";
import { payloadRulesApi, type PayloadRulesDryRunResult } from "@code-proxy/api-client";
import {
  payloadRulesDraft,
  VISUAL_CONFIG_PROTOCOL_OPTIONS,
  type PayloadDraftSection,
  type VisualConfigValues,
} from "@features/visual-config-editor";
import { Button, Callout, FormField, Select, surface, Textarea, TextInput } from "@code-proxy/ui";
import { useOptionalAuth } from "@app/providers/AuthProvider";
import { PayloadRuleDryRunResult } from "./PayloadRuleDryRunResult";

// 试运行时协议必须选一个：真实请求总有协议，留空会让限定了协议的规则全部放行，结果不可信。
const PROTOCOL_OPTIONS = VISUAL_CONFIG_PROTOCOL_OPTIONS.filter((option) => option.value !== "");

type Outcome = {
  result: PayloadRulesDryRunResult;
  formIndexes: Record<PayloadDraftSection, number[]>;
  /** 运行时的规则草稿，用来提示「结果对应的是改动前的规则」。 */
  draftKey: string;
};

/** 样例请求体必须是 JSON 对象：上游请求体都是对象。 */
function sampleError(body: string): "empty" | "invalid" | "" {
  if (!body.trim()) return "empty";
  try {
    const parsed: unknown = JSON.parse(body);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? "" : "invalid";
  } catch {
    return "invalid";
  }
}

/**
 * 「试一试」：贴一段样例请求体，用页面上（还没保存的）规则跑一遍，看发往上游的请求体会变成什么样、
 * 每条规则做了什么。只在后端声明 payload-rules-dry-run 时出现。
 */
export function PayloadRuleDryRun({
  values,
}: {
  values: Pick<
    VisualConfigValues,
    "payloadDefaultRules" | "payloadOverrideRules" | "payloadFilterRules"
  >;
}) {
  const { t } = useTranslation();
  // 试运行是 POST，后端要求保存这些规则的权限（system.config.write）。
  const canRun = useOptionalAuth()?.can("system.config.write") ?? true;
  const [model, setModel] = useState("");
  const [requestedModel, setRequestedModel] = useState("");
  const [protocol, setProtocol] = useState<string>("openai");
  const [body, setBody] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const draft = useMemo(() => payloadRulesDraft(values), [values]);
  const draftKey = useMemo(() => JSON.stringify(draft.rules), [draft]);
  const bodyError = sampleError(body);
  const modelMissing = !model.trim() && !requestedModel.trim();

  const run = async () => {
    setSubmitted(true);
    if (bodyError || modelMissing) return;
    setRunning(true);
    setError("");
    try {
      const result = await payloadRulesApi.dryRun({
        model: model.trim(),
        "requested-model": requestedModel.trim() || undefined,
        protocol,
        body,
        rules: draft.rules,
      });
      setOutcome({ result, formIndexes: draft.formIndexes, draftKey });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className={surface({ radius: "2xl" })}>
      <div className="px-5 pt-4 pb-3">
        <h3 className="text-sm font-semibold text-ink">{t("config_ui.payload.dry_run.title")}</h3>
        <p className="mt-0.5 text-xs leading-5 text-ink-3">{t("config_ui.payload.dry_run.desc")}</p>
      </div>
      <div className="space-y-3 px-5 pb-5">
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_200px]">
          <FormField
            label={t("config_ui.payload.dry_run.model")}
            error={
              submitted && modelMissing ? t("config_ui.payload.dry_run.model_required") : undefined
            }
          >
            <TextInput
              value={model}
              onChange={(e) => setModel(e.currentTarget.value)}
              placeholder="gpt-5"
              spellCheck={false}
            />
          </FormField>
          <FormField label={t("config_ui.payload.dry_run.requested_model")} optional>
            <TextInput
              value={requestedModel}
              onChange={(e) => setRequestedModel(e.currentTarget.value)}
              placeholder={t("config_ui.payload.dry_run.requested_model_placeholder")}
              spellCheck={false}
            />
          </FormField>
          <FormField label={t("config_ui.payload.dry_run.protocol")} className="min-w-0">
            <Select
              value={protocol}
              onChange={setProtocol}
              options={PROTOCOL_OPTIONS.map((option) => ({
                value: option.value,
                label: option.label,
              }))}
              aria-label={t("config_ui.payload.dry_run.protocol")}
              className="w-full"
            />
          </FormField>
        </div>
        <FormField
          label={t("config_ui.payload.dry_run.body")}
          description={t("config_ui.payload.dry_run.body_hint")}
          error={
            submitted && bodyError ? t(`config_ui.payload.dry_run.body_${bodyError}`) : undefined
          }
        >
          <Textarea
            value={body}
            onChange={(e) => setBody(e.currentTarget.value)}
            placeholder={
              '{\n  "model": "gpt-5",\n  "messages": [{ "role": "user", "content": "hi" }]\n}'
            }
            rows={8}
            spellCheck={false}
            className="min-h-0 font-mono text-xs"
          />
        </FormField>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            size="sm"
            variant="primary"
            onClick={() => void run()}
            disabled={running || !canRun}
          >
            <Play size={14} />
            {running ? t("config_ui.payload.dry_run.running") : t("config_ui.payload.dry_run.run")}
          </Button>
          {!canRun ? (
            <span className="text-xs text-ink-3">
              {t("config_ui.payload.dry_run.no_permission")}
            </span>
          ) : null}
          {outcome && outcome.draftKey !== draftKey ? (
            <span className="text-xs text-ink-3">{t("config_ui.payload.dry_run.stale")}</span>
          ) : null}
        </div>
        {error ? (
          <Callout tone="danger" role="alert">
            {error}
          </Callout>
        ) : null}
        {outcome ? (
          <PayloadRuleDryRunResult result={outcome.result} formIndexes={outcome.formIndexes} />
        ) : null}
      </div>
    </div>
  );
}
