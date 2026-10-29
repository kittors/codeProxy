import { AlertTriangle } from "lucide-react";
import { HoverTooltip } from "@code-proxy/ui";
import type { AuthFileRestrictionBadge } from "@code-proxy/domain";
import { RESTRICTION_TONE_CLASSES } from "../hooks/presentationStyles";
import { useLiveNowMs } from "../hooks/useLiveNowMs";

/** 随时间变化的文字：自己带时钟，一秒重渲染一次，不牵动调用方。 */
function LiveText({ render }: { render: (nowMs: number) => string }) {
  const nowMs = useLiveNowMs();
  return <>{render(nowMs)}</>;
}

interface AuthFileRestrictionChipProps {
  badge: AuthFileRestrictionBadge;
  /** 页面时钟：除倒计时之外的一切仍按它算（倒计时为什么不能用它，见 useLiveNowMs）。 */
  nowMs: number;
  formatText: (badge: AuthFileRestrictionBadge, nowMs: number) => string;
  formatTooltip: (badge: AuthFileRestrictionBadge, nowMs: number) => string;
}

/**
 * 账号卡片和表格行上的一条限制徽章。
 *
 * 后端写明了原因的冷却，徽章上带着剩余时间，所以它自己走表（一秒一次，只重渲染这一个小组件），
 * 走到 0 就收起来——和重新读一遍列表后的样子一致，后端不会再列出已经结束的冷却。
 * 其它徽章的文字不随时间变，仍按页面时钟算，行为和以前完全一样。
 * 气泡里的恢复时间打开时才挂载，所以总是当下的数。
 */
export function AuthFileRestrictionChip({
  badge,
  nowMs,
  formatText,
  formatTooltip,
}: AuthFileRestrictionChipProps) {
  const recoverAtMs = badge.recoverAtMs;
  const countdown = Boolean(badge.cooldownReason) && recoverAtMs !== undefined;
  const liveNowMs = useLiveNowMs(1000, countdown);
  const clockMs = countdown ? liveNowMs : nowMs;
  if (countdown && recoverAtMs !== undefined && recoverAtMs <= clockMs) return null;

  return (
    <HoverTooltip content={<LiveText render={(at) => formatTooltip(badge, at)} />} placement="top">
      <span
        data-testid="auth-file-restriction-badge"
        className={[
          "inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-semibold tabular-nums",
          RESTRICTION_TONE_CLASSES[badge.tone],
        ].join(" ")}
      >
        <AlertTriangle size={11} className="shrink-0" />
        <span className="min-w-0 truncate">{formatText(badge, clockMs)}</span>
      </span>
    </HoverTooltip>
  );
}
