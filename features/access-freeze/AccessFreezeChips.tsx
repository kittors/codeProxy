import { Lock } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AccessFreeze } from "@code-proxy/api-client";
import { cn } from "@code-proxy/ui";
import { formatFreezeTime, freezeProviderName } from "./format";

const CHIP =
  "inline-flex max-w-full items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-xs font-medium text-rose-700 transition-colors hover:bg-rose-500/15 dark:text-rose-300";

/**
 * 列表行上的「Codex 已冻结」标签：每个被冻结的上游一枚，点开就是该账号的冻结详情。
 * 最多露出 max 枚，其余折成「+N」（点它同样打开详情）：一个账号被好几个上游冻结的情形很少，
 * 但不能把行撑高。
 */
export function AccessFreezeChips({
  freezes,
  onOpen,
  max = 2,
  className,
}: {
  freezes: readonly AccessFreeze[];
  onOpen: () => void;
  max?: number;
  className?: string;
}) {
  const { t, i18n } = useTranslation();
  if (freezes.length === 0) return null;
  const shown = freezes.slice(0, max);
  const hidden = freezes.length - shown.length;
  return (
    <div className={cn("flex flex-wrap justify-center gap-1", className)}>
      {shown.map((freeze) => {
        const provider = freezeProviderName(t, freeze);
        return (
          <button
            key={freeze.id}
            type="button"
            className={CHIP}
            title={t("access_freeze.chip_title", {
              time: formatFreezeTime(freeze.frozen_at, i18n.resolvedLanguage),
            })}
            onClick={onOpen}
          >
            <Lock size={11} aria-hidden="true" className="shrink-0" />
            <span className="truncate">{t("access_freeze.chip", { provider })}</span>
          </button>
        );
      })}
      {hidden > 0 ? (
        <button
          type="button"
          className={CHIP}
          aria-label={t("access_freeze.chip_more_label", { count: hidden })}
          onClick={onOpen}
        >
          +{hidden}
        </button>
      ) : null}
    </div>
  );
}
