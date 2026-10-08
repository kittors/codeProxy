import type { ReactNode } from "react";
import { Inbox } from "lucide-react";
import { dialogToneClass } from "../overlays/DialogIcon";

/**
 * Quiet empty / no-data surface used by DataTable and page-level cards.
 *
 * Reads as inline feedback inside an existing panel: no dashed card chrome. The icon
 * sits in a round tile coloured by the shared icon → hue registry (theme/hues) when the
 * appearance setting colours icons, and in a neutral tile when icons are monochrome; the
 * text stays in the neutral ink hierarchy either way.
 *
 * - `icon` omitted → default Inbox glyph
 * - `icon={null}` → no icon
 * - `icon={<MyIcon />}` → custom glyph, coloured the same way
 */
export function EmptyState({
  title = "",
  description,
  icon,
  action,
}: {
  title?: string;
  description?: string;
  /** Custom icon node. Omit for the default Inbox; pass `null` to hide. */
  icon?: ReactNode | null;
  action?: ReactNode;
}) {
  const showIcon = icon !== null;
  const resolvedIcon =
    icon === undefined ? (
      <Inbox size={20} aria-hidden />
    ) : (
      icon
    );

  return (
    <div
      className="flex flex-col items-center justify-center px-4 py-8 text-center sm:px-6 sm:py-10"
      data-empty-state
    >
      {showIcon && resolvedIcon ? (
        <div
          className={[
            "mb-3 flex h-11 w-11 items-center justify-center rounded-full [&>svg]:h-5 [&>svg]:w-5",
            dialogToneClass("auto", resolvedIcon),
          ].join(" ")}
          data-empty-icon
        >
          {resolvedIcon}
        </div>
      ) : null}
      <p className="text-sm font-medium text-ink-2">{title}</p>
      {description ? (
        <p className="mx-auto mt-1 max-w-[18rem] text-xs leading-relaxed text-ink-3">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
