import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "satin-ui/react";
import { useTranslation } from "react-i18next";
import { copyTextToClipboard } from "../utils/clipboard";
import { cn } from "../utils/selectStyles";

/**
 * Satin 复制按钮：使用 `.sn-btn.sn-ghost.sn-xs.sn-ibtn` + `.sn-swap`
 * 实现复制图标到对勾的原地缩放交叉微动效。
 */
export function CopyButton({
  value,
  label,
  className,
  onCopied,
}: {
  value: string;
  label?: string;
  className?: string;
  /** 复制成功后回调（例如一次性密钥弹窗据此放开「点遮罩关闭」）。 */
  onCopied?: () => void;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    },
    [],
  );
  const copy = useCallback(async () => {
    if (!value) return;
    const ok = await copyTextToClipboard(value);
    if (!ok) return;
    onCopied?.();
    setCopied(true);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setCopied(false), 1600);
  }, [onCopied, value]);
  const name = label ?? t("common.copy", { defaultValue: "复制" });
  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-label={copied ? t("common.copied", { defaultValue: "已复制" }) : name}
      data-tooltip={copied ? t("common.copied", { defaultValue: "已复制" }) : name}
      className={cn(
        "sn-btn sn-ghost sn-xs sn-ibtn shrink-0",
        copied ? "!text-[var(--sn-success)]" : null,
        className,
      )}
    >
      <span className={cn("sn-swap", copied ? "sn-swapped" : null)}>
        <span className="sn-swap-a">
          <Icon name="copy" size={14} />
        </span>
        <span className="sn-swap-b">
          <Icon name="check" size={14} />
        </span>
      </span>
    </button>
  );
}

export interface DetailItem {
  label: ReactNode;
  value: ReactNode;
  /** 提供时在值后面放一个复制按钮。 */
  copyValue?: string;
  /** ID、密钥、路径这类值用等宽字体。 */
  mono?: boolean;
  /** 占满整行（长文本、JSON）。 */
  wide?: boolean;
  hint?: ReactNode;
}

/**
 * 详情键值表：标签在上、值在下，两列网格；长值（`wide`）占满一行。
 * 空值统一显示为一条短横线，避免「标签后面什么都没有」看起来像加载失败。
 */
export function DetailList({
  items,
  columns = 2,
  className,
}: {
  items: readonly DetailItem[];
  columns?: 1 | 2 | 3;
  className?: string;
}) {
  const columnClass = {
    1: "grid-cols-1",
    2: "grid-cols-1 sm:grid-cols-2",
    3: "grid-cols-1 sm:grid-cols-3",
  }[columns];
  return (
    <dl className={cn("grid gap-x-6 gap-y-4", columnClass, className)}>
      {items.map((item, index) => {
        const empty =
          item.value === null ||
          item.value === undefined ||
          (typeof item.value === "string" && item.value.trim() === "");
        return (
          <div key={index} className={cn("min-w-0", item.wide ? "sm:col-span-full" : null)}>
            <dt className="text-xs text-[var(--sn-label3)]">{item.label}</dt>
            <dd className="mt-1 flex min-w-0 items-start gap-1 text-sm text-[var(--sn-label)]">
              <span
                className={cn(
                  "min-w-0 flex-1 break-words",
                  item.mono ? "font-mono text-xs leading-5" : null,
                  empty ? "text-[var(--sn-label-off)]" : null,
                )}
              >
                {empty ? "—" : item.value}
              </span>
              {item.copyValue && !empty ? (
                <CopyButton value={item.copyValue} className="-my-1" />
              ) : null}
            </dd>
            {item.hint ? <p className="mt-1 text-xs text-[var(--sn-label3)]">{item.hint}</p> : null}
          </div>
        );
      })}
    </dl>
  );
}
