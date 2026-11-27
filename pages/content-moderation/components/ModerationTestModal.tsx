import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FlaskConical, ShieldCheck, ShieldX, TriangleAlert } from "@code-proxy/ui/icons";
import {
  contentModerationApi,
  type ContentModerationDecision,
  type ContentModerationProfileView,
} from "@code-proxy/api-client";
import {
  Button,
  Callout,
  DataGrid,
  FormField,
  Modal,
  Textarea,
  surface,
  type DataGridColumn,
} from "@code-proxy/ui";

interface ScoreRow {
  category: string;
  score: number;
  threshold?: number;
}

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
 * 测试输入不保存，弹窗关掉就没了。敏感词规则有自己的测试弹窗（@features/word-policy）。
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

  const scoreRows = useMemo<ScoreRow[]>(
    () =>
      Object.entries(decision?.category_scores ?? {})
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([category, score]) => ({
          category,
          score,
          threshold: decision?.thresholds[category],
        })),
    [decision],
  );
  const scoreColumns = useMemo<DataGridColumn<ScoreRow>[]>(
    () => [
      {
        id: "category",
        header: t("content_moderation.category"),
        width: 200,
        grow: true,
        cell: (row) => <span className="truncate font-mono text-xs text-sn-label2">{row.category}</span>,
      },
      {
        id: "score",
        header: t("content_moderation.score"),
        align: "end",
        width: 112,
        cell: (row) => {
          // 与服务端判定一致（backend_openai.go：score >= threshold 即命中），超线的分数标红。
          const over = row.threshold !== undefined && row.score >= row.threshold;
          return (
            <span
              className={`text-xs tabular-nums ${over ? "font-semibold text-rose-600 dark:text-rose-400" : "text-sn-label2"}`}
            >
              {row.score.toFixed(4)}
            </span>
          );
        },
      },
      {
        id: "threshold",
        header: t("content_moderation.threshold"),
        align: "end",
        width: 112,
        cell: (row) => (
          <span className="text-xs tabular-nums text-sn-label3">{row.threshold?.toFixed(4) ?? "--"}</span>
        ),
      },
    ],
    [t],
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
      description={profile ? t("content_moderation.test_description", { name: profile.name }) : undefined}
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
                <span className="rounded-full bg-sn-label/[0.05] px-2.5 py-1 text-xs font-semibold tabular-nums text-sn-label2 dark:bg-white/[0.07]">
                  {t("content_moderation.latency_value", { value: decision.latency_ms })}
                </span>
              }
            >
              <span className="font-mono text-xs text-sn-label3">{decision.action}</span>
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
                          ? "bg-sn-accent-soft font-medium text-sn-accent-ink colorful:bg-sn-accent colorful:text-sn-on-primary"
                          : "bg-sn-label/[0.05] text-sn-label3 dark:bg-white/[0.07]",
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
              <div className="space-y-1 text-sm text-sn-label2">
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
              // 浅底框里的小表：不再套外框，最高 13rem 后表内滚动（表头吸顶）；
              // 浅底框不设 --sn-backdrop，这里补上，行底色才和框一致。
              <div
                className={`overflow-hidden [--sn-backdrop:var(--sn-fill-subtle)] ${surface({ tone: "inset", radius: "xl" })}`}
              >
                <DataGrid<ScoreRow>
                  frame={false}
                  density="compact"
                  label={t("content_moderation.score")}
                  columns={scoreColumns}
                  rows={scoreRows}
                  rowKey={(row) => row.category}
                  maxHeight="13rem"
                />
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </Modal>
  );
}
