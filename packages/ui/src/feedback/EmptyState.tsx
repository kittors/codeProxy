import type { ReactNode } from "react";
import { Inbox } from "lucide-react";

/**
 * Shared empty / no-data surface used by DataTable and page-level cards.
 *
 * - `icon` omitted → soft Inbox glyph in a rounded well (default empty look)
 * - `icon={null}` → no icon (rare; prefer the default)
 * - `icon={<MyIcon />}` → custom glyph, still framed by the same well
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
      <Inbox
        size={28}
        strokeWidth={1.6}
        className="text-slate-500 dark:text-white/70"
        aria-hidden
      />
    ) : (
      icon
    );

  return (
    <div className="rounded-2xl border border-dashed border-slate-200/90 bg-gradient-to-b from-slate-50/90 to-white/80 px-6 py-12 text-center shadow-sm dark:border-neutral-800 dark:from-neutral-950/50 dark:to-neutral-950/30">
      {showIcon && resolvedIcon ? (
        <div
          className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-inset ring-slate-200/90 dark:bg-white/[0.06] dark:ring-white/10"
          data-empty-icon
        >
          <div className="flex items-center justify-center text-slate-500 dark:text-white/70 [&>svg]:h-7 [&>svg]:w-7">
            {resolvedIcon}
          </div>
        </div>
      ) : null}
      <p className="text-sm font-semibold tracking-tight text-slate-900 dark:text-white">
        {title}
      </p>
      {description ? (
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-500 dark:text-white/60">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}
