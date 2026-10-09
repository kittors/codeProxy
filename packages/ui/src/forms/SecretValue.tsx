import { Eye, EyeOff } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../utils/selectStyles";
import { CopyButton } from "./DetailList";

const MASK = "••••••••••••••••";

/**
 * 一次性凭证（密码、API Key）的展示块：标签 + 等宽值 + 复制按钮，可选「显示 / 隐藏」。
 *
 * 值整块可选（select-all），手动复制也是一次选中全部；复制按钮常驻在值的右侧，
 * 不用先找「复制」在哪里。默认明文显示——这类弹窗的目的就是让用户马上抄走。
 */
export function SecretValue({
  label,
  value,
  maskable = false,
  hint,
  className,
  onCopied,
}: {
  label: ReactNode;
  value: string;
  /** 默认遮住，点眼睛再显示（给旁边可能有人的场景）。 */
  maskable?: boolean;
  hint?: ReactNode;
  className?: string;
  onCopied?: () => void;
}) {
  const { t } = useTranslation();
  const [revealed, setRevealed] = useState(!maskable);
  const labelText = typeof label === "string" ? label : undefined;
  return (
    <div className={cn("min-w-0", className)}>
      <div className="mb-1.5 text-xs font-medium text-ink-2">{label}</div>
      <div className="flex min-w-0 items-center gap-1 rounded-xl bg-subtle py-1.5 pr-1.5 pl-3.5">
        <code
          className={cn(
            "min-w-0 flex-1 font-mono text-sm leading-6 text-ink",
            revealed ? "select-all break-all" : "select-none tracking-wider text-ink-3",
          )}
        >
          {revealed ? value : MASK}
        </code>
        {maskable ? (
          <button
            type="button"
            onClick={() => setRevealed((previous) => !previous)}
            aria-label={
              revealed
                ? t("common.hide", { defaultValue: "隐藏" })
                : t("common.show", { defaultValue: "显示" })
            }
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-hover hover:text-ink"
          >
            {revealed ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
          </button>
        ) : null}
        <CopyButton
          value={value}
          onCopied={onCopied}
          label={
            labelText
              ? t("common.copy_named", { name: labelText, defaultValue: "复制{{name}}" })
              : undefined
          }
        />
      </div>
      {hint ? <p className="mt-1.5 text-xs text-ink-3">{hint}</p> : null}
    </div>
  );
}
