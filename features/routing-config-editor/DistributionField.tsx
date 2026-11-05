import { useTranslation } from "react-i18next";
import { Select } from "@code-proxy/ui";
import { normalizeDistribution, type RoutingDistribution } from "@features/visual-config-editor";
import { Field } from "./fields";

/**
 * 渠道组的「分配方式」下拉。从 RoutingConfigEditor 拆出来（那个文件卡在行数棘轮上）。
 *
 * 「按重置时间」只在后端声明 channel-group-distribution-reset-aware 时提供：旧后端把不认识的
 * 值读成按权重分配，存下去等于悄悄换了调度方式。当前值已经是它时照常显示，免得下拉框空白。
 */
export function DistributionField({
  value,
  resetAwareSupported,
  disabled,
  onChange,
}: {
  value: RoutingDistribution;
  resetAwareSupported: boolean;
  disabled?: boolean;
  onChange: (distribution: RoutingDistribution) => void;
}) {
  const { t } = useTranslation();
  const options: Array<{ value: RoutingDistribution; label: string }> = [
    { value: "weighted", label: t("channel_groups_page.distribution_weighted") },
    { value: "least-load", label: t("channel_groups_page.distribution_least_load") },
    { value: "fill-first", label: t("channel_groups_page.distribution_fill_first") },
  ];
  if (resetAwareSupported || value === "reset-aware") {
    options.push({
      value: "reset-aware",
      label: t("channel_groups_page.distribution_reset_aware"),
    });
  }
  return (
    <Field
      label={t("channel_groups_page.distribution_label")}
      tooltip={t("channel_groups_page.distribution_tooltip")}
      hint={
        value === "reset-aware"
          ? t("channel_groups_page.distribution_reset_aware_hint")
          : t("channel_groups_page.distribution_hint")
      }
    >
      <Select
        aria-label={t("channel_groups_page.distribution_label")}
        value={value}
        disabled={disabled}
        className="w-full"
        options={options}
        onChange={(next) => onChange(normalizeDistribution(next))}
      />
    </Field>
  );
}
