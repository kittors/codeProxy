import { PlanBadge } from "@code-proxy/ui";
import { formatPlanBadgeLabel, planTierOf } from "@code-proxy/domain";

/**
 * AI 账号的会员徽章（PRO 20X、MAX 5X、PLUS……）。颜色取账号供应商的品牌色，隆重程度取会员
 * 等级：同一档在 Codex、Claude、Antigravity 之间颜色不同，同一家的 PLUS、PRO、PRO 20X 一眼
 * 分得出高低；免费和认不出的套餐保持低调。列表视图和卡片视图共用这一个，两处不会各配各的色。
 */
export function AuthFilePlanBadge({
  provider,
  planType,
  className,
}: {
  /** resolveFileType() 给出的供应商类型，决定品牌色。 */
  provider: string;
  /** 展示用套餐（含 Codex 按周预算推断出的 pro_5x / pro_20x）。 */
  planType: string;
  className?: string;
}) {
  return (
    <PlanBadge
      data-testid="auth-file-plan-badge"
      vendor={provider}
      tier={planTierOf(planType)}
      className={className}
    >
      {formatPlanBadgeLabel(planType)}
    </PlanBadge>
  );
}
