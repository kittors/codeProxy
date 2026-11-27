import { useTranslation } from "react-i18next";
import { Icon } from "satin-ui/react";
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
        variant={masked ? "primary" : (variant ?? "secondary")}
        size={size}
        onClick={onToggle}
        aria-label={label}
        aria-pressed={masked}
        title={label}
        className={className}
      >
        <Icon name={masked ? "eye-off" : "eye"} size={15} />
      </Button>
    </HoverTooltip>
  );
}
