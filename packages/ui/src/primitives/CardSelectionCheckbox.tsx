import { Check } from "lucide-react";

export interface CardSelectionCheckboxProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Announced to assistive tech and shown as the control's title. */
  label: string;
  /**
   * Keep the control on screen even when the card is not hovered. Selected
   * cards pass true so a selection stays visible once the pointer moves away.
   */
  alwaysVisible?: boolean;
  className?: string;
}

/**
 * Per-card selection control for the AI providers and AI accounts card grids.
 *
 * A 24px box that matches the power and menu buttons it sits beside, but reads
 * as a checkbox rather than another button: outlined and empty when unselected,
 * filled with a tick when selected. Rendered as a tinted square like its
 * neighbours it was just a blank grey tile, and as a raw `input` it looked like
 * an unrelated widget wedged into a row of buttons.
 *
 * Below `md` it is always visible — there is no hover on touch.
 */
export function CardSelectionCheckbox({
  checked,
  onCheckedChange,
  label,
  alwaysVisible = false,
  className,
}: CardSelectionCheckboxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      title={label}
      onClick={() => onCheckedChange(!checked)}
      className={[
        "inline-flex h-6 w-6 items-center justify-center rounded-md transition-all",
        checked
          ? "bg-slate-900 text-white dark:bg-white dark:text-neutral-950"
          : "border border-slate-300 bg-white text-transparent hover:border-slate-400 hover:text-slate-300 dark:border-white/20 dark:bg-transparent dark:hover:border-white/35 dark:hover:text-white/30",
        checked || alwaysVisible
          ? "opacity-100 pointer-events-auto"
          : "opacity-100 pointer-events-auto md:opacity-0 md:pointer-events-none md:group-hover/card:opacity-100 md:group-focus-within/card:opacity-100 md:group-hover/card:pointer-events-auto md:group-focus-within/card:pointer-events-auto",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <Check size={13} strokeWidth={3} />
    </button>
  );
}
