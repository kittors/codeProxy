import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ShieldAlert } from "lucide-react";
import { Textarea } from "@code-proxy/ui";
import { privacyMaskingApi, type PrivacyMaskPolicy, type PrivacyMaskPreview } from "@code-proxy/api-client";
import { kindStyle } from "./maskKinds";
import { KindChip } from "./KindChip";

const PLACEHOLDER = /\{\{[A-Z][A-Z0-9_]*_[a-z2-7]{8}(?:[a-z2-7]{8})?\}\}/g;

const tenantPreview = (text: string, policy?: PrivacyMaskPolicy) => privacyMaskingApi.preview(text, policy);

/**
 * 试一试：粘一段 agent 可能发出的文字，按当前（还没保存的）设置在服务器上脱敏一遍，显示上游会
 * 收到什么、找到了哪些值。文字只用来预览，不保存，也不进任何记录。
 *
 * 控制台传设置页的草稿 policy；门户只读，不传 policy，由门户的 preview 按现在对这个用户生效的
 * 规则处理（不含管理员的脱敏词和自定义规则）。
 */
export function MaskingTryIt({
  policy,
  preview = tenantPreview,
  stacked = false,
}: {
  policy?: PrivacyMaskPolicy;
  preview?: (text: string, policy?: PrivacyMaskPolicy) => Promise<PrivacyMaskPreview>;
  stacked?: boolean;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [result, setResult] = useState<PrivacyMaskPreview | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!text.trim()) {
      setResult(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      preview(text, policy)
        .then((value) => {
          if (cancelled) return;
          setResult(value);
          setError("");
        })
        .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [text, policy, preview]);

  const ink = (value: string): ReactNode[] => {
    const out: ReactNode[] = [];
    let last = 0;
    for (const match of value.matchAll(PLACEHOLDER)) {
      const at = match.index ?? 0;
      out.push(value.slice(last, at));
      const kind = match[0].slice(2, match[0].lastIndexOf("_"));
      out.push(
        <mark key={at} className={`rounded px-0.5 ${kindStyle(kind).mark}`}>
          {match[0]}
        </mark>,
      );
      last = at + match[0].length;
    }
    out.push(value.slice(last));
    return out;
  };

  return (
    <div className={`grid gap-3 ${stacked ? "" : "lg:grid-cols-2"}`}>
      <Textarea
        rows={6}
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={t("privacy_masking.try.placeholder")}
        aria-label={t("privacy_masking.try.title")}
        className="font-mono text-xs"
      />
      <div className="min-h-[9.5rem] rounded-2xl bg-subtle px-3.5 py-3" aria-live="polite">
        {error ? (
          <p className="text-xs text-rose-600 dark:text-rose-300">{error}</p>
        ) : !result ? (
          <p className="text-xs text-ink-3">{t("privacy_masking.try.empty")}</p>
        ) : (
          <>
            <p className="mb-2 text-2xs font-medium text-ink-3">{t("privacy_masking.try.upstream")}</p>
            {result.blocked ? (
              <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-rose-600 dark:text-rose-300">
                <ShieldAlert size={14} aria-hidden="true" />
                {t("privacy_masking.try.blocked")}
              </p>
            ) : null}
            <p className="font-mono text-xs leading-relaxed break-words whitespace-pre-wrap text-ink-2">{ink(result.text)}</p>
            {result.values.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1">
                {result.values.map((value, index) => (
                  <KindChip key={index} kind={value.kind} count={value.n} />
                ))}
              </div>
            ) : (
              <p className="mt-2 text-xs text-ink-3">{t("privacy_masking.try.nothing")}</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
