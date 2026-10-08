import { CircleAlert } from "lucide-react";
import { HoverTooltip } from "@code-proxy/ui";

export function Field({
  label,
  hint,
  tooltip,
  children,
}: {
  label: string;
  hint?: string;
  tooltip?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="text-sm font-semibold text-ink">{label}</div>
        {tooltip ? <InfoTooltip content={tooltip} /> : null}
      </div>
      {hint ? <div className="text-xs text-ink-3">{hint}</div> : null}
      {children}
    </div>
  );
}

export function InfoTooltip({ content }: { content: string }) {
  return (
    <HoverTooltip content={content} placement="bottom">
      <span
        className="inline-flex h-6 w-6 items-center justify-center text-ink-3"
        aria-label={content}
        tabIndex={0}
      >
        <CircleAlert size={16} aria-hidden="true" />
      </span>
    </HoverTooltip>
  );
}

export function TooltipHeader({ label, tooltip }: { label: string; tooltip: string }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="truncate">{label}</span>
      <InfoTooltip content={tooltip} />
    </span>
  );
}

export function renderChannelTags(tags: string[]) {
  if (tags.length === 0) return null;
  return (
    <span aria-hidden="true" className="flex shrink-0 flex-wrap gap-1">
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-semibold bg-ink/[0.05] text-ink-2 dark:bg-white/[0.07] colorful:bg-sky-50 colorful:text-sky-700 colorful:dark:bg-sky-500/15 colorful:dark:text-sky-200"
        >
          {tag}
        </span>
      ))}
    </span>
  );
}
