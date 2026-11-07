import { ChevronDown, Loader2, RotateCw, Timer } from "lucide-react";
import { useTranslation } from "react-i18next";
import { DropdownMenu } from "@code-proxy/ui";
import {
  formatCooldownRemaining,
  type AuthFileCooldownReason,
  type AuthFileModelCooldownView,
} from "@code-proxy/domain";
import { RESTRICTION_TONE_CLASSES } from "../hooks/presentationStyles";
import { useLiveNowMs } from "../hooks/useLiveNowMs";

type DurationLabels = { day: string; hour: string; minute: string; second: string };

interface AuthFileModelCooldownMenuProps {
  /** 候选列表；已经走完的由菜单按自己的时钟丢掉。 */
  cooldowns: AuthFileModelCooldownView[];
  /** 没有写权限时菜单只读：照样列出被暂停的模型，但不能点。 */
  canRetry: boolean;
  isRetrying: (model: string) => boolean;
  onRetry: (model: string) => void;
  /** 原因码的本地化文案；不认识的码传 null，返回空串。 */
  formatReason: (reason: AuthFileCooldownReason | null) => string;
  durationLabels: DurationLabels;
}

/**
 * 卡片上的「冷却中的模型」：一个小标签，点开列出每个被暂停的模型、原因和剩余时间，
 * 点其中一项就是「立即重试这个模型」。
 *
 * 只在后端的列表带了 `model_cooldowns` 时才会被渲染（见 useAuthFileRestrictionBadges），
 * 所以连着没有这个接口的旧后端时，它不出现，也不会点出一个必败的请求。
 *
 * 剩余时间和「还剩几个」都按菜单自己的时钟算（见 useLiveNowMs）：走完的模型从菜单里消失，
 * 全部走完则整个菜单收起，和重新读一遍列表后的样子一致。
 */
export function AuthFileModelCooldownMenu({
  cooldowns: candidates,
  canRetry,
  isRetrying,
  onRetry,
  formatReason,
  durationLabels,
}: AuthFileModelCooldownMenuProps) {
  const { t } = useTranslation();
  const nowMs = useLiveNowMs();
  const cooldowns = candidates.filter(
    (cooldown) => cooldown.untilMs === null || cooldown.untilMs > nowMs,
  );

  const describe = (cooldown: AuthFileModelCooldownView): string => {
    const time =
      cooldown.untilMs !== null
        ? formatCooldownRemaining(cooldown.untilMs, nowMs, durationLabels)
        : t("auth_files.cooldown_no_end");
    const reason = formatReason(cooldown.reason);
    return reason ? t("auth_files.cooldown_badge", { reason, time }) : time;
  };

  if (cooldowns.length === 0) return null;

  return (
    <DropdownMenu.Root size="sm">
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          data-testid="auth-file-model-cooldown-trigger"
          className={[
            "inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-semibold tabular-nums",
            RESTRICTION_TONE_CLASSES.warning,
          ].join(" ")}
        >
          <Timer size={11} className="shrink-0" aria-hidden="true" />
          <span className="min-w-0 truncate">
            {t("auth_files.cooldown_models_chip", { count: cooldowns.length })}
          </span>
          <ChevronDown size={11} className="shrink-0" aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="start" className="max-h-72 w-72 max-w-[calc(100vw-2rem)] overflow-y-auto">
          <p className="px-2 pb-1 pt-1 text-2xs font-semibold text-ink-3">
            {t(
              canRetry
                ? "auth_files.cooldown_menu_title"
                : "auth_files.cooldown_menu_title_readonly",
            )}
          </p>
          {cooldowns.map((cooldown) => {
            const retrying = isRetrying(cooldown.model);
            const detail = describe(cooldown);
            return (
              <DropdownMenu.Item
                key={cooldown.model}
                disabled={!canRetry || retrying}
                aria-label={
                  canRetry
                    ? t("auth_files.cooldown_retry_item", { model: cooldown.model, detail })
                    : undefined
                }
                onSelect={() => onRetry(cooldown.model)}
              >
                {retrying ? (
                  <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                ) : (
                  <RotateCw size={14} aria-hidden="true" />
                )}
                <span className="min-w-0 flex-1 truncate font-mono text-xs">{cooldown.model}</span>
                <span className="shrink-0 text-2xs tabular-nums text-ink-3">{detail}</span>
              </DropdownMenu.Item>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
