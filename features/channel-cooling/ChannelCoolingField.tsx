import { useTranslation } from "react-i18next";
import { Select } from "@code-proxy/ui";
import type { CoolingMode } from "./coolingMode";

interface ChannelCoolingFieldProps {
  value: CoolingMode;
  onChange: (mode: CoolingMode) => void;
  /** 说明文字讲的是渠道还是账号。 */
  scope: "channel" | "account";
  /** section：供应商弹窗里的一组字段；field：账号详情里的一个字段，标题小一号。 */
  variant?: "section" | "field";
}

/**
 * 429/5xx 冷却开关：跟随全局、关闭、开启三选一。供应商渠道和 OAuth 账号共用。
 */
export function ChannelCoolingField({
  value,
  onChange,
  scope,
  variant = "section",
}: ChannelCoolingFieldProps) {
  const { t } = useTranslation();
  const label = t("channel_cooling.label");
  return (
    <div className="grid gap-2">
      <p
        className={
          variant === "section"
            ? "text-sm font-semibold text-ink"
            : "text-xs font-semibold text-ink-2"
        }
      >
        {label}
      </p>
      <Select
        value={value}
        onChange={(next) => onChange(next as CoolingMode)}
        options={[
          { value: "", label: t("channel_cooling.inherit") },
          { value: "off", label: t("channel_cooling.off") },
          { value: "on", label: t("channel_cooling.on") },
        ]}
        aria-label={label}
      />
      <p className="text-xs text-ink-3">
        {t(scope === "account" ? "channel_cooling.hint_account" : "channel_cooling.hint_channel")}
      </p>
    </div>
  );
}
