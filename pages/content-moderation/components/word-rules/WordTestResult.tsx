import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ShieldAlert, ShieldCheck, ShieldX, TriangleAlert } from "lucide-react";
import type { WordTestResult as WordTestOutcome } from "@code-proxy/api-client";
import { Callout, surface } from "@code-proxy/ui";
import { highlightSegments } from "./wordPolicyModel";

export interface WordTestResultProps {
  /** 测试时发送的原文：命中位置（UTF-16 偏移）是相对它的。 */
  input: string;
  result: WordTestOutcome;
}

const TEXT_BOX = `max-h-52 overflow-auto whitespace-pre-wrap break-words px-3 py-2.5 text-sm text-ink-2 ${surface({ tone: "inset", radius: "xl" })}`;

/**
 * 敏感词测试的结果：先给结论，再给依据——高亮标出原文里每一处命中，
 * 说明哪些命中是规范化（大小写、全角、零宽字符、空白、繁简体）之后才对上的，
 * 并给出上游实际会收到的文本，以及开了回复过滤时同样的文本出现在回复里会变成什么。
 */
export function WordTestResult({ input, result }: WordTestResultProps) {
  const { t } = useTranslation();
  const segments = useMemo(() => highlightSegments(input, result.matches), [input, result.matches]);
  const hasNormalizedOnly = result.matches.some((match) => match.normalized_only);
  const showOutput = result.action === "replace" || result.output !== input;
  const layers = result.layers.map((layer) => t(`content_moderation.words.scope_${layer}`)).join(" · ");

  const verdict = {
    block: {
      tone: "danger" as const,
      icon: <ShieldX />,
      title: t("content_moderation.words.test_blocked"),
    },
    replace: {
      tone: "warning" as const,
      icon: <ShieldAlert />,
      title: t("content_moderation.words.test_replaced", { count: result.replaced }),
    },
    log: {
      tone: "info" as const,
      icon: <TriangleAlert />,
      title: t("content_moderation.words.test_logged"),
    },
    allow: {
      tone: "success" as const,
      icon: <ShieldCheck />,
      title: t("content_moderation.words.test_clean"),
    },
  }[result.action];

  return (
    <section className="space-y-3" aria-live="polite" aria-label={t("content_moderation.words.test_result")}>
      <Callout
        tone={verdict.tone}
        icon={verdict.icon}
        title={verdict.title}
        actions={
          <span className="rounded-full bg-ink/[0.05] px-2.5 py-1 text-xs font-semibold tabular-nums text-ink-2 dark:bg-white/[0.07]">
            {t("content_moderation.latency_value", { value: result.latency_ms })}
          </span>
        }
      >
        <div className="space-y-0.5 text-xs text-ink-3">
          {result.action === "block" && result.block_message ? (
            <p className="text-sm text-ink-2">{result.block_message}</p>
          ) : null}
          {result.action === "log" ? <p>{t("content_moderation.words.test_logged_hint")}</p> : null}
          {layers ? <p>{t("content_moderation.words.test_layers", { layers })}</p> : null}
        </div>
      </Callout>

      {result.matches.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-ink">{t("content_moderation.words.test_hits_in_text")}</p>
          <div className={TEXT_BOX} data-testid="word-test-highlight">
            {segments.map((segment, index) =>
              segment.hits > 0 ? (
                <mark
                  key={index}
                  data-normalized-only={segment.normalizedOnly || undefined}
                  title={
                    segment.normalizedOnly
                      ? t("content_moderation.words.hit_normalized")
                      : t("content_moderation.words.hit_as_written")
                  }
                  className={[
                    "rounded-sm bg-rose-500/15 px-0.5 text-rose-800 dark:text-rose-200",
                    segment.normalizedOnly
                      ? "underline decoration-dotted decoration-2 underline-offset-4"
                      : "",
                  ].join(" ")}
                >
                  {segment.text}
                </mark>
              ) : (
                <span key={index}>{segment.text}</span>
              ),
            )}
          </div>
          {hasNormalizedOnly ? (
            <p className="text-xs text-ink-3">{t("content_moderation.words.hit_normalized_legend")}</p>
          ) : null}
        </div>
      ) : null}

      {showOutput ? (
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-ink">{t("content_moderation.words.test_output")}</p>
          <div className={TEXT_BOX} data-testid="word-test-output">
            {result.output}
          </div>
        </div>
      ) : null}

      {result.reply_filter ? (
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-ink">{t("content_moderation.words.test_reply")}</p>
          {(result.reply_output ?? "") === input ? (
            <p className="text-xs text-ink-3">{t("content_moderation.words.test_reply_unchanged")}</p>
          ) : (
            <div className={TEXT_BOX} data-testid="word-test-reply">
              {result.reply_output}
            </div>
          )}
        </div>
      ) : null}

      {result.matches.length > 0 ? (
        <div className="space-y-1.5">
          <div className={`max-h-52 overflow-y-auto ${surface({ tone: "inset", radius: "xl" })}`}>
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-subtle text-ink-3">
                <tr>
                  <th className="px-3 py-2 font-semibold">{t("content_moderation.words.col_layer")}</th>
                  <th className="px-3 py-2 font-semibold">{t("content_moderation.words.col_pattern")}</th>
                  <th className="px-3 py-2 font-semibold">{t("content_moderation.words.col_action")}</th>
                  <th className="px-3 py-2 font-semibold">{t("content_moderation.words.col_matched")}</th>
                </tr>
              </thead>
              <tbody>
                {result.matches.map((match, index) => (
                  <tr key={`${match.rule_id}:${match.start}:${index}`} className="border-t border-line">
                    <td className="px-3 py-2 text-ink-2">
                      {t(`content_moderation.words.scope_${match.layer}`)}
                    </td>
                    <td className="px-3 py-2">
                      <span className="mr-1.5 text-ink-3">
                        {t(`content_moderation.words.kind_${match.kind}`)}
                      </span>
                      <span className="font-mono text-ink-2">{match.pattern}</span>
                    </td>
                    <td className="px-3 py-2 text-ink-2">
                      {t(`content_moderation.words.action_${match.action}`)}
                    </td>
                    <td className="px-3 py-2 text-ink-3">
                      {match.normalized_only
                        ? t("content_moderation.words.matched_normalized")
                        : t("content_moderation.words.matched_as_written")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {result.match_count > result.matches.length ? (
            <p className="text-xs text-ink-3">
              {t("content_moderation.words.test_more_hits", {
                shown: result.matches.length,
                count: result.match_count,
              })}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
