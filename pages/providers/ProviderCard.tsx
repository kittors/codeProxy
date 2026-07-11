import { useState, type ReactNode } from "react";
import { DropdownMenu } from "@code-proxy/ui";
import { EllipsisVertical, Power, Settings2, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

export interface ProviderCardProps {
  /** Card title (provider name) */
  title: string;
  /** Whether the card is selected for batch operations */
  selected?: boolean;
  /** Whether the provider is enabled */
  enabled?: boolean;
  /** Whether the card should appear dimmed (disabled state) */
  dimmed?: boolean;
  /** Whether to use natural height (no max-h, no internal scroll). For cards that need full content visible. */
  naturalHeight?: boolean;
  /** Callback when selection checkbox changes */
  onToggleSelected?: (checked: boolean) => void;
  /** Callback when enabled toggle changes */
  onToggleEnabled?: (enabled: boolean) => void;
  /** Callback when edit button is clicked */
  onEdit?: () => void;
  /** Callback when delete button is clicked */
  onDelete?: () => void;
  /** Extra elements rendered in the header row, after title */
  headerExtra?: ReactNode;
  /** Footer content fixed at card bottom (e.g. status bar) */
  footer?: ReactNode;
  /** Card body content */
  children?: ReactNode;
  className?: string;
}

export function ProviderCard({
  title,
  selected = false,
  enabled = true,
  dimmed = false,
  naturalHeight = false,
  onToggleSelected,
  onToggleEnabled,
  onEdit,
  onDelete,
  headerExtra,
  footer,
  children,
  className,
}: ProviderCardProps) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const hasActionMenu = Boolean(onEdit || onDelete || onToggleEnabled);
  const hasHeaderExtra = Boolean(headerExtra);

  return (
    <div
      className={[
        "group relative flex min-w-0 flex-col rounded-xl border px-4 py-3 shadow-sm transition-all duration-200 ease-out",
        naturalHeight
          ? "h-fit self-start min-h-0"
          : "min-h-[220px] max-h-[260px]",
        selected
          ? "border-blue-400 bg-blue-50/50 ring-1 ring-blue-200 dark:border-blue-500/50 dark:bg-blue-950/20 dark:ring-blue-500/20"
          : "border-slate-200 bg-white/70 hover:border-slate-300 hover:bg-white hover:shadow-md dark:border-neutral-800 dark:bg-neutral-950/60 dark:hover:border-neutral-700 dark:hover:bg-neutral-950/80 dark:hover:shadow-lg dark:hover:shadow-black/20",
        dimmed ? "opacity-50" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Header */}
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center">
          {onToggleSelected ? (
            <div
              className={[
                "flex shrink-0 items-center justify-center overflow-hidden transition-[width,opacity,margin] duration-200 ease-out",
                selected
                  ? "mr-2 w-7 opacity-100"
                  : "mr-0 w-0 opacity-0 group-hover:mr-2 group-hover:w-7 group-hover:opacity-100 max-md:mr-2 max-md:w-7 max-md:opacity-100",
              ].join(" ")}
            >
              <input
                type="checkbox"
                aria-label={t("providers.select_provider", { name: title })}
                checked={selected}
                onChange={(e) => onToggleSelected(e.currentTarget.checked)}
                className="h-4 w-4 rounded border-slate-300 text-slate-900 accent-slate-900 focus-visible:ring-2 focus-visible:ring-slate-400/35 dark:border-neutral-700 dark:bg-neutral-950 dark:text-white dark:accent-white dark:focus-visible:ring-white/15"
              />
            </div>
          ) : null}
          <p
            className="min-w-0 max-w-[180px] truncate text-sm font-semibold text-slate-900 dark:text-white"
            title={title}
          >
            {title}
          </p>
          {hasHeaderExtra ? (
            <div className="ml-2 flex shrink-0 items-center gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
              {headerExtra}
            </div>
          ) : null}
        </div>
        {hasActionMenu ? (
          <DropdownMenu.Root open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                className={[
                  "inline-flex h-5 w-5 flex-none items-center justify-center rounded-full border-0 bg-transparent p-0 text-slate-500 shadow-none outline-none ring-0 transition-[color,opacity] duration-150 ease-out hover:bg-transparent hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-slate-400/35 active:bg-transparent dark:text-white/55 dark:hover:bg-transparent dark:hover:text-white dark:focus-visible:ring-white/15",
                  menuOpen
                    ? "pointer-events-auto opacity-100"
                    : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 max-md:pointer-events-auto max-md:opacity-100",
                ].join(" ")}
                aria-label={t("providers.more_actions")}
                title={t("providers.more_actions")}
                data-tooltip-placement="left"
              >
                <EllipsisVertical size={13} />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content align="end" sideOffset={8}>
                {onToggleEnabled ? (
                  <DropdownMenu.Item onSelect={() => onToggleEnabled(!enabled)}>
                    <Power size={15} />
                    <span>
                      {enabled ? t("providers.disable") : t("providers.enable")}
                    </span>
                  </DropdownMenu.Item>
                ) : null}
                {onEdit ? (
                  <DropdownMenu.Item onSelect={() => onEdit()}>
                    <Settings2 size={15} />
                    <span>{t("providers.edit")}</span>
                  </DropdownMenu.Item>
                ) : null}
                {onDelete ? (
                  <DropdownMenu.Item
                    className="text-rose-600 focus:text-rose-700 dark:text-rose-300"
                    onSelect={() => onDelete()}
                  >
                    <Trash2 size={15} />
                    <span>{t("providers.delete")}</span>
                  </DropdownMenu.Item>
                ) : null}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        ) : null}
      </div>

      {/* Content */}
      {children ? (
        <div
          className={[
            "mt-2 min-w-0 flex-1",
            naturalHeight ? "" : "overflow-y-auto",
          ].join(" ")}
        >
          {children}
        </div>
      ) : null}
      {footer ? (
        <div className={naturalHeight ? "pt-3" : "mt-auto pt-3"}>{footer}</div>
      ) : null}
    </div>
  );
}

export function ProviderCardSkeleton({
  naturalHeight = false,
}: {
  naturalHeight?: boolean;
}) {
  return (
    <div
      className={[
        "flex flex-col rounded-xl border border-slate-200 bg-white/70 px-4 py-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60",
        naturalHeight
          ? "h-fit min-h-[220px] w-full max-w-[22rem] flex-none self-start"
          : "h-[220px]",
      ].join(" ")}
      aria-hidden="true"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="h-4 w-32 animate-pulse rounded-full bg-slate-200 dark:bg-white/10" />
        <div className="h-5 w-5 animate-pulse rounded-full bg-slate-200 dark:bg-white/10" />
      </div>
      <div className="mt-4 space-y-2">
        <div className="h-3 w-11/12 animate-pulse rounded-full bg-slate-200 dark:bg-white/10" />
        <div className="h-3 w-3/4 animate-pulse rounded-full bg-slate-200 dark:bg-white/10" />
      </div>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="h-5 w-20 animate-pulse rounded-full bg-slate-200 dark:bg-white/10"
          />
        ))}
      </div>
      <div className="mt-auto pt-3">
        <div className="h-2 w-full animate-pulse rounded-full bg-slate-200 dark:bg-white/10" />
      </div>
    </div>
  );
}
