import { useState, type ReactNode } from "react";
import {
  Card,
  DropdownMenu,
  OverflowTooltip,
  ToggleSwitch,
  buttonClassName,
} from "@code-proxy/ui";
import { Ellipsis, Power, Settings2, Trash2 } from "lucide-react";
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
  const showSelectionControl = Boolean(onToggleSelected) && selected;

  return (
    <Card
      padding="default"
      bodyClassName="mt-0 flex min-h-0 flex-1 flex-col"
      className={[
        "group group/card flex h-full w-full max-w-[34rem] flex-col rounded-3xl border-slate-900/8 shadow-[0_8px_24px_rgb(15_23_42_/_0.04)] transition-colors duration-200 ease-out hover:border-slate-300 hover:bg-white md:max-w-none dark:border-white/[0.08] dark:shadow-[0_8px_24px_rgb(0_0_0_/_0.28)] dark:hover:border-neutral-700 dark:hover:bg-neutral-950/70",
        naturalHeight ? "h-fit self-start min-h-0" : "min-h-[220px]",
        selected
          ? "border-slate-900 ring-1 ring-slate-300 dark:border-white dark:ring-white/20"
          : "",
        dimmed ? "opacity-85" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <OverflowTooltip
            content={title}
            title={title}
            className="min-w-0 flex-1 truncate text-sm leading-5 font-semibold tracking-tight text-slate-900 dark:text-white"
          >
            {title}
          </OverflowTooltip>

          <div className="flex h-6 shrink-0 items-center gap-1.5">
            {onToggleSelected ? (
              <div
                className={[
                  "flex h-6 w-6 items-center justify-center transition-opacity",
                  showSelectionControl
                    ? "opacity-100 pointer-events-auto"
                    : "opacity-100 pointer-events-auto md:opacity-0 md:pointer-events-none md:group-hover/card:opacity-100 md:group-focus-within/card:opacity-100 md:group-hover/card:pointer-events-auto md:group-focus-within/card:pointer-events-auto",
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
            {onToggleEnabled ? (
              <div
                className={[
                  "flex h-6 items-center justify-center transition-opacity",
                  "opacity-100 pointer-events-auto md:opacity-0 md:pointer-events-none md:group-hover/card:opacity-100 md:group-focus-within/card:opacity-100 md:group-hover/card:pointer-events-auto md:group-focus-within/card:pointer-events-auto",
                ].join(" ")}
              >
                <ToggleSwitch
                  ariaLabel={
                    enabled ? t("providers.disable") : t("providers.enable")
                  }
                  checked={enabled}
                  onCheckedChange={onToggleEnabled}
                />
              </div>
            ) : null}
          </div>
        </div>

        {headerExtra ? (
          <div className="min-w-0 flex flex-wrap items-center gap-1">
            {headerExtra}
          </div>
        ) : null}
      </div>

      {children ? (
        <div
          className={[
            "min-h-0 min-w-0 flex-1 touch-pan-y px-0.5 mt-3 py-1",
            naturalHeight ? "" : "overflow-y-auto",
          ].join(" ")}
        >
          {children}
        </div>
      ) : null}

      {footer || hasActionMenu ? (
        <div className="mt-auto flex items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-white/[0.06]">
          <div className="min-w-0 flex-1">{footer}</div>
          {hasActionMenu ? (
            <DropdownMenu.Root open={menuOpen} onOpenChange={setMenuOpen}>
              <DropdownMenu.Trigger asChild>
                <button
                  type="button"
                  className={buttonClassName({
                    variant: "ghost",
                    size: "sm",
                    iconOnly: true,
                  })}
                  aria-label={t("providers.more_actions")}
                  title={t("providers.more_actions")}
                  data-tooltip-placement="top"
                >
                  <Ellipsis size={16} />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content align="end" sideOffset={8} className="min-w-44">
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
      ) : null}
    </Card>
  );
}

export function ProviderCardSkeleton({
  naturalHeight = false,
}: {
  naturalHeight?: boolean;
}) {
  return (
    <div aria-hidden="true">
      <Card
        padding="default"
        bodyClassName="mt-0 flex min-h-0 flex-1 flex-col"
        className={[
          "flex h-full w-full max-w-[34rem] flex-col rounded-3xl border-slate-900/8 shadow-[0_8px_24px_rgb(15_23_42_/_0.04)] md:max-w-none dark:border-white/[0.08] dark:shadow-[0_8px_24px_rgb(0_0_0_/_0.28)]",
          naturalHeight
            ? "h-fit min-h-[220px] w-full max-w-[22rem] flex-none self-start"
            : "min-h-[220px]",
        ].join(" ")}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="h-4 w-32 animate-pulse rounded-full bg-slate-200 dark:bg-white/10" />
          <div className="h-6 w-12 animate-pulse rounded-full bg-slate-200 dark:bg-white/10" />
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
        <div className="mt-auto border-t border-slate-100 pt-3 dark:border-white/[0.06]">
          <div className="h-2 w-full animate-pulse rounded-full bg-slate-200 dark:bg-white/10" />
        </div>
      </Card>
    </div>
  );
}
