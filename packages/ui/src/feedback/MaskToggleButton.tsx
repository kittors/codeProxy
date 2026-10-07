import { useTranslation } from "react-i18next";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "../primitives/Button";
import { HoverTooltip } from "../overlays/Tooltip";

export interface MaskToggleButtonProps {
  masked: boolean;
  onToggle: () => void;
  size?: "xs" | "sm" | "md";
  className?: string;
  variant?: "secondary" | "ghost" | "default";
}

export function MaskToggleButton({
  masked,
  onToggle,
  size = "sm",
  className,
  variant,
}: MaskToggleButtonProps) {
  const { t } = useTranslation();
  const label = masked ? t("common.unmask_sensitive_data") : t("common.mask_sensitive_data");

  return (
    <HoverTooltip content={label}>
      <Button
        type="button"
        // 遮罩开启时用强调色实心按钮表达「按下」状态，与调用方传入的变体无关。
        variant={masked ? "primary" : (variant ?? "secondary")}
        size={size}
        onClick={onToggle}
        aria-label={label}
        aria-pressed={masked}
        title={label}
        className={className}
      >
        {masked ? <EyeOff size={15} /> : <Eye size={15} />}
      </Button>
    </HoverTooltip>
  );
}
