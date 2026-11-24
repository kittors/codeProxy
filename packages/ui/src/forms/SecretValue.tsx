import { useState, type ReactNode } from "react";
import { Icon } from "satin-ui/react";
import { useTranslation } from "react-i18next";
import { cn } from "../utils/selectStyles";
import { CopyButton } from "./DetailList";

const MASK = "••••••••••••••••";

/**
 * 一次性凭证（密码、API Key）的 Satin 展示块：标签 + 等宽值 + Satin 显示切换与复制翻转按钮。
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
      <div className="mb-1.5 text-xs font-medium text-[var(--sn-label2)]">{label}</div>
      <div className="flex min-w-0 items-center gap-1 rounded-xl bg-[var(--sn-fill-subtle)] py-1.5 pr-1.5 pl-3.5">
        <code
          className={cn(
            "min-w-0 flex-1 font-mono text-sm leading-6 text-[var(--sn-label)]",
            revealed ? "break-all select-all" : "tracking-wider text-[var(--sn-label3)] select-none",
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
            className="sn-btn sn-ghost sn-xs sn-ibtn sn-round shrink-0"
          >
            <Icon name={revealed ? "eye-off" : "eye"} size={14} />
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
      {hint ? <p className="mt-1.5 text-xs text-[var(--sn-label3)]">{hint}</p> : null}
    </div>
  );
}
