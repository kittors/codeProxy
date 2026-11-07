import { useTranslation } from "react-i18next";
import { CircleCheck, CircleX, Loader2 } from "lucide-react";
import type { TestOutcome } from "./useChannelTest";

/** 测试发送的结果，列表行和编辑弹窗共用。后端的失败原因很短、不含地址和令牌，原样显示。 */
export function TestResultLine({
  outcome,
  pending,
}: {
  outcome: TestOutcome | undefined;
  pending: boolean;
}) {
  const { t } = useTranslation();
  if (pending) {
    return (
      <span role="status" className="inline-flex items-center gap-1 text-xs text-ink-3">
        <Loader2
          size={12}
          className="motion-reduce:animate-none motion-safe:animate-spin"
          aria-hidden="true"
        />
        {t("alerts_page.test.sending")}
      </span>
    );
  }
  if (!outcome) return null;
  if (outcome.ok) {
    return (
      <span
        role="status"
        className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-300"
      >
        <CircleCheck size={12} aria-hidden="true" />
        {t("alerts_page.test.sent", { ms: outcome.durationMs })}
      </span>
    );
  }
  return (
    <span
      role="status"
      className="inline-flex min-w-0 items-start gap-1 text-xs text-rose-600 dark:text-rose-400"
    >
      <CircleX size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0 break-words">
        {outcome.message
          ? t("alerts_page.test.failed", { error: outcome.message })
          : t("alerts_page.test.no_result")}
      </span>
    </span>
  );
}
