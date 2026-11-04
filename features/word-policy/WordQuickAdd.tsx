import { useEffect, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { FileUp, Plus, Regex } from "lucide-react";
import type { WordPolicyLimits } from "@code-proxy/api-client";
import { Button, Textarea } from "@code-proxy/ui";
import { planQuickAdd, type DraftRule, type QuickAddPlan } from "./wordPolicyModel";

export interface WordQuickAddProps {
  rules: readonly DraftRule[];
  limits: Pick<WordPolicyLimits, "max_rules" | "max_keyword_chars">;
  disabled?: boolean;
  /** 新词加在列表最前面，刚加的一眼就能看到。 */
  onAdd: (fresh: DraftRule[]) => void;
  onAddRegex: () => void;
  onImport: () => void;
}

/** 加词结果的提示停留多久；之后换回常驻的用法说明，免得保存之后还挂着上一次的「已加入」。 */
const FEEDBACK_MS = 6000;

/** 一次添加的结果说明：加了几个、为什么跳过了其余的。 */
function describePlan(
  t: (key: string, options?: Record<string, unknown>) => string,
  plan: QuickAddPlan,
  maxKeywordChars: number,
): string {
  const parts: string[] = [];
  if (plan.fresh.length > 0) {
    parts.push(t("content_moderation.words.quick_added", { count: plan.fresh.length }));
  }
  if (plan.duplicates.length > 0) {
    parts.push(t("content_moderation.words.quick_skipped_duplicate", { count: plan.duplicates.length }));
  }
  if (plan.tooLong.length > 0) {
    parts.push(
      t("content_moderation.words.quick_skipped_too_long", {
        count: plan.tooLong.length,
        max: maxKeywordChars,
      }),
    );
  }
  if (plan.overLimit.length > 0) {
    parts.push(t("content_moderation.words.quick_skipped_over_limit", { count: plan.overLimit.length }));
  }
  return parts.join(" · ");
}

/**
 * 快速添加关键词：输入一个词按回车就加进列表；用逗号、顿号、分号或换行分开可以一次加很多个，
 * 直接粘贴一整段词表也行。已在列表里的、过长的会跳过并说明原因。正则表达式和文件导入走旁边的按钮。
 *
 * 加进来的只是草稿，和其它改动一起点「保存」才生效。
 */
export function WordQuickAdd({ rules, limits, disabled = false, onAdd, onAddRegex, onImport }: WordQuickAddProps) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [feedback, setFeedback] = useState<{ message: string; tone: "ok" | "warn" } | null>(null);

  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(null), FEEDBACK_MS);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  const submit = () => {
    if (disabled || text.trim() === "") return;
    const plan = planQuickAdd(text, rules, limits);
    if (plan.fresh.length > 0) onAdd(plan.fresh);
    const message = describePlan(t, plan, limits.max_keyword_chars);
    setFeedback(message ? { message, tone: plan.fresh.length > 0 ? "ok" : "warn" } : null);
    // 全部被跳过时保留输入，方便用户改一改再加；加进去了就清空。
    if (plan.fresh.length > 0) setText("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // 回车添加，Shift+回车换行；输入法组字时的回车是确认候选词，不能当成提交。
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    submit();
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <Textarea
            value={text}
            // 平时和单行输入框一样高；粘贴进多行时跟着长高（最多 6 行，再多就在框里滚动）。
            rows={Math.min(6, Math.max(1, text.split("\n").length))}
            disabled={disabled}
            aria-label={t("content_moderation.words.quick_add_label")}
            placeholder={t("content_moderation.words.quick_add_placeholder")}
            className="!min-h-9 !resize-none !py-2"
            onChange={(event) => {
              setText(event.currentTarget.value);
              setFeedback(null);
            }}
            onKeyDown={onKeyDown}
          />
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button variant="primary" size="sm" disabled={disabled || text.trim() === ""} onClick={submit}>
            <Plus size={14} />
            {t("content_moderation.words.quick_add_submit")}
          </Button>
          <Button variant="secondary" size="sm" disabled={disabled} onClick={onAddRegex}>
            <Regex size={14} />
            {t("content_moderation.words.add_regex")}
          </Button>
          <Button variant="secondary" size="sm" disabled={disabled} onClick={onImport}>
            <FileUp size={14} />
            {t("content_moderation.words.import")}
          </Button>
        </div>
      </div>
      <p
        aria-live="polite"
        className={[
          "min-h-4 text-xs",
          feedback?.tone === "warn" ? "text-amber-700 dark:text-amber-300" : "text-ink-3",
        ].join(" ")}
      >
        {feedback?.message ?? t("content_moderation.words.quick_add_hint")}
      </p>
    </div>
  );
}
