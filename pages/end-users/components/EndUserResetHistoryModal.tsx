import { useTranslation } from "react-i18next";
import type { EndUserDailySpendingResetEvent } from "@code-proxy/api-client";
import { SpendingResetHistoryModal, formatQuotaUsdAmount } from "@features/period-spending";

function isAmount(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * 账号的手动重置记录。表格与排序来自共享的 SpendingResetHistoryModal；账号版在表格上方
 * 多两张数字卡：当日实际消耗（后端算出的真实花费）与当前有效今日用量（扣掉重置后的值），
 * 对账时一眼看出「重置清掉了多少」。后端没返回实际消耗时，描述会改口说明只剩有效用量。
 */
export function EndUserResetHistoryModal({
  open,
  onClose,
  userName,
  loading,
  events,
  rawTodayCost,
  dailySpendingUsed,
}: {
  open: boolean;
  onClose: () => void;
  userName: string;
  loading: boolean;
  events: EndUserDailySpendingResetEvent[];
  rawTodayCost?: number;
  dailySpendingUsed?: number;
}) {
  const { t } = useTranslation();
  const hasRawTodayCost = isAmount(rawTodayCost);
  const unavailable = t("end_users.reset_history_amount_unavailable");

  return (
    <SpendingResetHistoryModal
      open={open}
      onClose={onClose}
      namespace="end_users"
      title={t("end_users.reset_history_title", { name: userName })}
      description={t(
        hasRawTodayCost
          ? "end_users.reset_history_desc"
          : "end_users.reset_history_desc_effective_only",
      )}
      loading={loading}
      events={events}
      showEventId
      summary={
        // 两张数字卡：简约风格下同一种淡底、靠标题区分；多彩风格下「实际消耗」卡是琥珀淡底。
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-2xl bg-subtle px-4 py-3 colorful:bg-amber-500/[0.08]">
            <div className="text-xs font-medium text-ink-3 colorful:text-amber-700 colorful:dark:text-amber-300">
              {t("end_users.reset_history_raw_today_summary")}
            </div>
            <div className="mt-1 text-lg font-semibold tabular-nums text-ink">
              {hasRawTodayCost ? formatQuotaUsdAmount(rawTodayCost) : unavailable}
            </div>
          </div>
          <div className="rounded-2xl bg-subtle px-4 py-3">
            <div className="text-xs font-medium text-ink-3">
              {t("end_users.reset_history_effective_used_summary")}
            </div>
            <div className="mt-1 text-lg font-semibold tabular-nums text-ink">
              {isAmount(dailySpendingUsed) ? formatQuotaUsdAmount(dailySpendingUsed) : unavailable}
            </div>
          </div>
        </div>
      }
    />
  );
}
