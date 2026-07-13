import type { ReactNode } from "react";
import { Inbox } from "lucide-react";

/**
 * Quiet empty / no-data surface used by DataTable and page-level cards.
 *
 * Matches the admin shell: soft slate hierarchy, no dashed card chrome,
 * no floating icon tile. Reads as inline feedback inside an existing panel.
 *
 * - `icon` omitted → default Inbox glyph
 * - `icon={null}` → no icon
 * - `icon={<MyIcon />}` → custom glyph at the same muted weight
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
      <Inbox size={22} strokeWidth={1.5} aria-hidden />
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
          className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100/90 text-slate-400 dark:bg-white/[0.06] dark:text-white/40 [&>svg]:h-5 [&>svg]:w-5 [&>svg]:stroke-[1.5]"
          data-empty-icon
        >
          {resolvedIcon}
        </div>
      ) : null}
      <p className="text-sm font-medium text-slate-600 dark:text-white/70">{title}</p>
      {description ? (
        <p className="mx-auto mt-1.5 max-w-[18rem] text-xs leading-relaxed text-slate-400 dark:text-white/40">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
