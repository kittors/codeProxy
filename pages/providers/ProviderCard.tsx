import { useState, type ReactNode } from "react";
import {
  Card,
  DropdownMenu,
  EntityCard,
  HoverTooltip,
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
  /** Denser paddings and radius, for grids of four columns or more. */
  dense?: boolean;
  /** Callback when selection checkbox changes */
  onToggleSelected?: (checked: boolean) => void;
  /** Callback when enabled toggle changes */
  onToggleEnabled?: (enabled: boolean) => void;
  /** Callback when edit button is clicked */
  onEdit?: () => void;
  /** Callback when delete button is clicked */
  onDelete?: () => void;
  /** Badges shown beside the title (channel id, latency probe). */
  headerExtra?: ReactNode;
  /** Per-card actions in the header's control cluster (e.g. refresh usage). */
  headerActions?: ReactNode;
  /** Rows under the title: connection details, badges, model chips. */
  header?: ReactNode;
  /** Left side of the footer row, e.g. the success-rate bar. */
  footer?: ReactNode;
  /** Card body content */
  children?: ReactNode;
  className?: string;
}

/**
 * Provider channel card.
 *
 * The surface, header layout, selection checkbox and footer rule all come from
 * EntityCard, the card the AI accounts page uses; this component only supplies
 * what is specific to a provider — the enable toggle and the edit/delete menu.
 */
export function ProviderCard({
  title,
  selected = false,
  enabled = true,
  dimmed = false,
  dense = false,
  onToggleSelected,
  onToggleEnabled,
  onEdit,
  onDelete,
  headerExtra,
  headerActions,
  header,
  footer,
  children,
  className,
}: ProviderCardProps) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const hasActionMenu = Boolean(onEdit || onDelete || onToggleEnabled);

  return (
    <EntityCard
      title={title}
      dense={dense}
      selected={selected}
      dimmed={dimmed}
      className={className}
      onToggleSelected={onToggleSelected}
      selectionLabel={t("providers.select_provider", { name: title })}
      titleAdornment={headerExtra}
      header={header}
      fill={false}
      headerControls={
        <>
          {headerActions}
          {onToggleEnabled ? (
            // Power button rather than a hover-only switch, as on the account
            // card: whether a channel is on has to be visible without moving
            // the pointer onto it.
            <HoverTooltip
              content={enabled ? t("providers.disable") : t("providers.enable")}
            >
              <button
                type="button"
                className={[
                  "inline-flex h-6 w-6 items-center justify-center rounded-md transition-colors",
                  enabled
                    ? "bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300"
                    : "bg-slate-100 text-slate-400 hover:bg-slate-200 dark:bg-white/10 dark:text-white/45",
                ].join(" ")}
                aria-label={
                  enabled ? t("providers.disable") : t("providers.enable")
                }
                aria-pressed={enabled}
                onClick={() => onToggleEnabled(!enabled)}
              >
                <Power size={13} />
              </button>
            </HoverTooltip>
          ) : null}
          {hasActionMenu ? (
              <DropdownMenu.Root open={menuOpen} onOpenChange={setMenuOpen}>
                <DropdownMenu.Trigger asChild>
                  <button
                    type="button"
                    className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-slate-100 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-700 dark:bg-white/10 dark:text-white/55 dark:hover:bg-white/15 dark:hover:text-white/80"
                    aria-label={t("providers.more_actions")}
                    title={t("providers.more_actions")}
                    data-tooltip-placement="top"
                  >
                    <Ellipsis size={14} />
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    align="end"
                    sideOffset={8}
                    className="min-w-44"
                  >
                    {onToggleEnabled ? (
                      <DropdownMenu.Item
                        onSelect={() => onToggleEnabled(!enabled)}
                      >
                        <Power size={15} />
                        <span>
                          {enabled
                            ? t("providers.disable")
                            : t("providers.enable")}
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
        </>
      }
      footer={footer}
    >
      {children}
    </EntityCard>
  );
}

export function ProviderCardSkeleton({ dense = false }: { dense?: boolean }) {
  return (
    <div
      aria-hidden="true"
      className="flex h-full w-full max-w-[34rem] md:max-w-none"
    >
      <Card
        padding={dense ? "compact" : "default"}
        bodyClassName="mt-0 flex min-h-0 flex-1 flex-col"
        className={[
          "flex h-full w-full flex-col border-slate-900/8 shadow-[0_8px_24px_rgb(15_23_42_/_0.04)] dark:border-white/[0.08] dark:shadow-[0_8px_24px_rgb(0_0_0_/_0.28)]",
          dense ? "rounded-2xl" : "rounded-3xl",
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
