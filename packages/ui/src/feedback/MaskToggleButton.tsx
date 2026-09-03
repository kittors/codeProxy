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
        variant={variant ?? (masked ? "default" : "secondary")}
        size={size}
        onClick={onToggle}
        aria-label={label}
        aria-pressed={masked}
        title={label}
        className={[
          masked
            ? "bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-indigo-500 dark:text-white dark:hover:bg-indigo-600"
            : "",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {masked ? <EyeOff size={15} /> : <Eye size={15} />}
      </Button>
    </HoverTooltip>
  );
}
