import { useEffect, useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  PERIOD_SPENDING_PERIODS,
  type PeriodSpendingItem,
  type PeriodSpendingLimits,
  LIFETIME_QUOTA_PERIOD,
  type QuotaResetPeriod,
} from "@code-proxy/api-client";
import { Button, Callout, CheckboxField, ConfirmModal, Modal, surface } from "@code-proxy/ui";
import { formatQuotaUsd } from "./PeriodSpendingCell";

export type PeriodQuotaResetScope = "account" | "key";

export interface PeriodQuotaResetModalProps {
  open: boolean;
  scope: PeriodQuotaResetScope;
  subjectName: string;
  configuredLimits?: PeriodSpendingLimits;
  periodSpendingItems?: PeriodSpendingItem[];
  /** Account cumulative allowance; enables the "grant again" option. */
  lifetimeLimit?: number;
  busy?: boolean;
  /** 重置失败的原因：留在弹窗里显示，用户可以直接重试或取消。 */
  error?: string;
  onClose: () => void;
  onConfirm: (periods: QuotaResetPeriod[]) => void;
}

interface ConfiguredPeriod {
  period: QuotaResetPeriod;
  limit: number;
  /** 当前周期已用（来自 period-spending 明细；累计额度没有这项）。 */
  used?: number;
}

const configuredPeriodsFrom = (
  limits: PeriodSpendingLimits | undefined,
  items: PeriodSpendingItem[] | undefined,
  lifetimeLimit: number | undefined,
): ConfiguredPeriod[] => {
  const itemByPeriod = new Map(items?.map((item) => [item.period, item]) ?? []);
  const rolling = PERIOD_SPENDING_PERIODS.flatMap((period): ConfiguredPeriod[] => {
    const item = itemByPeriod.get(period);
    const limit = limits?.[period] ?? item?.limit ?? 0;
    return limit > 0 ? [{ period: period as QuotaResetPeriod, limit, used: item?.used }] : [];
  });
  // Resetting the cumulative allowance is what "grant a fresh allowance" means,
  // so it belongs in the same dialog as the rolling-period resets.
  if ((lifetimeLimit ?? 0) > 0) {
    rolling.push({ period: LIFETIME_QUOTA_PERIOD, limit: lifetimeLimit as number });
  }
  return rolling;
};

/**
 * 重置周期配额。
 *
 * 只清零已用额度、可以随时再用掉，属于「可恢复但影响大」的操作，所以用琥珀色的
 * warning 外观和「重置」图标，不用删除的红色与垃圾桶。被重置的对象（账号 / Key 名称）
 * 单独放在卡片里；只配了一个周期时直接确认，多个周期时逐项勾选，每项写明已用与上限，
 * 用户能看到「这一下会清掉多少」。
 */
export function PeriodQuotaResetModal({
  open,
  scope,
  subjectName,
  configuredLimits,
  periodSpendingItems,
  lifetimeLimit,
  busy = false,
  error,
  onClose,
  onConfirm,
}: PeriodQuotaResetModalProps) {
  const { t } = useTranslation();
  const configuredPeriods = useMemo(
    () => configuredPeriodsFrom(configuredLimits, periodSpendingItems, lifetimeLimit),
    [configuredLimits, periodSpendingItems, lifetimeLimit],
  );
  const [selectedPeriods, setSelectedPeriods] = useState<Set<QuotaResetPeriod>>(
    () => new Set(),
  );

  useEffect(() => {
    if (open) setSelectedPeriods(new Set());
  }, [open, scope, subjectName]);

  if (configuredPeriods.length === 0) return null;

  const title = t(`quota.reset.${scope}_title`);
  const errorCallout = error ? (
    <Callout tone="danger" role="alert">
      {error}
    </Callout>
  ) : null;
  const subject = (
    <span className="flex min-w-0 items-center justify-between gap-3">
      <span className="truncate font-medium">{subjectName}</span>
      <span className="shrink-0 text-xs text-ink-3">{t(`quota.reset.subject_${scope}`)}</span>
    </span>
  );

  if (configuredPeriods.length === 1) {
    const [{ period }] = configuredPeriods;
    return (
      <ConfirmModal
        open={open}
        title={title}
        description={t(`quota.reset.${scope}_single_lead`, { period: t(`quota.period.${period}`) })}
        variant="warning"
        icon={<RotateCcw />}
        subject={subject}
        confirmText={t("quota.reset.confirm")}
        busy={busy}
        onClose={onClose}
        onConfirm={() => onConfirm([period])}
      >
        {errorCallout}
      </ConfirmModal>
    );
  }

  const selected = configuredPeriods
    .filter(({ period }) => selectedPeriods.has(period))
    .map(({ period }) => period);

  // 多周期版要「至少勾一项才能确认」，ConfirmModal 还没有禁用确认按钮的参数，
  // 所以沿用同一套外观（图标、色调、对象卡片、尾部按钮）手工拼在 Modal 上。
  return (
    <Modal
      open={open}
      title={title}
      description={t(`quota.reset.${scope}_multiple_lead`)}
      icon={<RotateCcw />}
      tone="warning"
      size="sm"
      initialFocus="panel"
      dirty={false}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={selected.length === 0}
            onClick={() => onConfirm(selected)}
          >
            {t("quota.reset.confirm_selected")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className={`${surface({ tone: "inset", radius: "2xl" })} px-4 py-3 text-sm text-ink`}>
          {subject}
        </div>
        <div className="space-y-2">
          {configuredPeriods.map(({ period, limit, used }) => (
            <CheckboxField
              key={period}
              checked={selectedPeriods.has(period)}
              disabled={busy}
              onCheckedChange={(nextChecked) => {
                setSelectedPeriods((current) => {
                  const next = new Set(current);
                  if (nextChecked) next.add(period);
                  else next.delete(period);
                  return next;
                });
              }}
              // 可访问名称保持「重置 X 配额」：读屏只听到勾选项本身时也知道勾下去会做什么。
              label={t("quota.reset.period_checkbox", { period: t(`quota.period.${period}`) })}
              description={
                typeof used === "number"
                  ? t("quota.reset.option_usage", {
                      used: formatQuotaUsd(used),
                      limit: formatQuotaUsd(limit),
                    })
                  : t("quota.reset.option_limit", { limit: formatQuotaUsd(limit) })
              }
            />
          ))}
        </div>
        {errorCallout}
      </div>
    </Modal>
  );
}
