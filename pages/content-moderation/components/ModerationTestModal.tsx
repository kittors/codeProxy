import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FlaskConical, ShieldCheck, ShieldX, TriangleAlert } from "lucide-react";
import {
  contentModerationApi,
  type ContentModerationDecision,
  type ContentModerationProfileView,
} from "@code-proxy/api-client";
import { Button, Callout, FormField, Modal, Textarea, surface } from "@code-proxy/ui";

export interface ModerationTestModalProps {
  profile: ContentModerationProfileView | null;
  onClose: () => void;
}

const SAFETY_BADGE: Record<NonNullable<ContentModerationDecision["safety"]>, string> = {
  Unsafe: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  Controversial: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  Safe: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
};

/**
 * 测试审核配置：输入一段文本，看这份配置会放行还是阻断。
 *
 * 结论放在最显眼的位置（红 = 会阻断、绿 = 会放行、琥珀 = 审核 API 出错按 fail-open 放行），
 * 依据（命中关键词、最高分类、各分类分数）跟在下面；运行按钮在底部，⌘/Ctrl + Enter 也能运行。
 * 测试输入不保存，弹窗关掉就没了。
 */
export function ModerationTestModal({ profile, onClose }: ModerationTestModalProps) {
  const { t } = useTranslation();
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [decision, setDecision] = useState<ContentModerationDecision | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!profile) return;
    setInput("");
    setDecision(null);
    setError("");
  }, [profile]);

  const scoreRows = useMemo(
    () =>
      Object.entries(decision?.category_scores ?? {}).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    [decision],
  );

  const run = async () => {
    if (!profile || !input.trim() || running) return;
    setRunning(true);
    setDecision(null);
    setError("");
    try {
      setDecision(await contentModerationApi.testProfile(profile.id, input.trim()));
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : t("content_moderation.test_failed"),
      );
    } finally {
      setRunning(false);
    }
  };

  const verdictTone = decision?.would_block
    ? "danger"
    : decision?.action === "api_error"
      ? "warning"
      : "success";
  const verdictIcon = decision?.would_block ? (
    <ShieldX />
  ) : decision?.action === "api_error" ? (
    <TriangleAlert />
  ) : (
    <ShieldCheck />
  );

  return (
    <Modal
      open={profile !== null}
      onClose={onClose}
      title={t("content_moderation.test_title")}
      description={
        profile ? t("content_moderation.test_description", { name: profile.name }) : undefined
      }
      icon={<FlaskConical />}
      size="lg"
      onSubmitShortcut={() => void run()}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={running}>
            {t("common.close")}
          </Button>
          <Button
            variant="primary"
            onClick={() => void run()}
            disabled={!input.trim()}
            loading={running}
          >
            {running ? t("content_moderation.testing") : t("content_moderation.run_test")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormField
          label={t("content_moderation.test_input")}
          description={t("content_moderation.no_prompt_storage")}
        >
          <Textarea
            value={input}
            onChange={(event) => setInput(event.currentTarget.value)}
            placeholder={t("content_moderation.test_input_placeholder")}
            aria-label={t("content_moderation.test_input")}
            className="min-h-36"
          />
        </FormField>

        {error ? (
          <Callout tone="danger" role="alert" title={t("content_moderation.test_failed")}>
            {error}
          </Callout>
        ) : null}

        {decision ? (
          <section className="space-y-3" aria-live="polite">
            <Callout
              tone={verdictTone}
              icon={verdictIcon}
              title={
                decision.would_block
                  ? t("content_moderation.test_blocked")
                  : t("content_moderation.test_allowed")
              }
              actions={
                <span className="rounded-full bg-ink/[0.05] px-2.5 py-1 text-xs font-semibold tabular-nums text-ink-2 dark:bg-white/[0.07]">
                  {t("content_moderation.latency_value", { value: decision.latency_ms })}
                </span>
              }
            >
              <span className="font-mono text-xs text-ink-3">{decision.action}</span>
            </Callout>

            {decision.safety ? (
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${SAFETY_BADGE[decision.safety]}`}
                >
                  {t(`content_moderation.safety_${decision.safety.toLowerCase()}`)}
                </span>
                {(decision.categories ?? []).map((category) => {
                  const matched = (decision.matched_scanners ?? []).includes(category);
                  return (
                    <span
                      key={category}
                      // 命中的类别：简约风格是强调色淡底；多彩风格的强调色是墨色，淡底和未命中的中性底
                      // 几乎分不出，所以和以前一样用强调色实心。
                      className={[
                        "rounded-full px-2.5 py-1 text-xs",
                        matched
                          ? "bg-accent-soft font-medium text-accent-ink colorful:bg-accent colorful:text-accent-fg"
                          : "bg-ink/[0.05] text-ink-3 dark:bg-white/[0.07]",
                      ].join(" ")}
                      title={
                        matched
                          ? t("content_moderation.scanner_matched")
                          : t("content_moderation.scanner_not_enabled")
                      }
                    >
                      {t(`content_moderation.scanner.${category}`, { defaultValue: category })}
                    </span>
                  );
                })}
              </div>
            ) : null}

            {decision.matched_keyword || decision.highest_category ? (
              <div className="space-y-1 text-sm text-ink-2">
                {decision.matched_keyword ? (
                  <p>
                    {t("content_moderation.matched_keyword", {
                      keyword: decision.matched_keyword,
                    })}
                  </p>
                ) : null}
                {decision.highest_category ? (
                  <p>
                    {t("content_moderation.highest_category", {
                      category: decision.highest_category,
                      score: decision.highest_score?.toFixed(4) ?? "0",
                    })}
                  </p>
                ) : null}
              </div>
            ) : null}

            {decision.moderation_error ? (
              <Callout tone="warning">
                {t("content_moderation.test_api_error", {
                  error: decision.moderation_error,
                })}
              </Callout>
            ) : null}

            {scoreRows.length ? (
              <div
                className={`max-h-52 overflow-y-auto ${surface({ tone: "inset", radius: "xl" })}`}
              >
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-subtle text-ink-3">
                    <tr>
                      <th className="px-3 py-2 font-semibold">
                        {t("content_moderation.category")}
                      </th>
                      <th className="px-3 py-2 text-right font-semibold">
                        {t("content_moderation.score")}
                      </th>
                      <th className="px-3 py-2 text-right font-semibold">
                        {t("content_moderation.threshold")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {scoreRows.map(([category, score]) => {
                      const threshold = decision.thresholds[category];
                      // 与服务端判定一致（backend_openai.go：score >= threshold 即命中），超线的分数标红。
                      const over = threshold !== undefined && score >= threshold;
                      return (
                        <tr key={category} className="border-t border-line">
                          <td className="px-3 py-2 font-mono text-ink-2">{category}</td>
                          <td
                            className={[
                              "px-3 py-2 text-right tabular-nums",
                              over ? "font-semibold text-rose-600 dark:text-rose-400" : "text-ink-2",
                            ].join(" ")}
                          >
                            {score.toFixed(4)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-ink-3">
                            {threshold?.toFixed(4) ?? "--"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </Modal>
  );
}
