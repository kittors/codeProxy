import { useState, type ReactNode } from "react";
import {
  DropdownMenu,
  EntityCard,
  EntityCardSkeleton,
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
 *
 * 头部的小按钮和 AI 账号卡片同一套：中性淡底；电源键开着时，简约风格换成强调色淡底
 * （强调色表达「选中 / 开启」），多彩风格是绿色淡底。
 */
const HEADER_BUTTON =
  "inline-flex h-6 w-6 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:shadow-control-focus";
const HEADER_BUTTON_IDLE =
  "bg-ink/[0.05] text-ink-3 hover:bg-ink/[0.08] hover:text-ink-2 dark:bg-white/[0.07] dark:hover:bg-white/[0.1]";
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
                  HEADER_BUTTON,
                  enabled
                    ? "bg-accent-soft text-accent-ink colorful:bg-emerald-50 colorful:text-emerald-600 colorful:hover:bg-emerald-100 colorful:dark:bg-emerald-500/15 colorful:dark:text-emerald-300 colorful:dark:hover:bg-emerald-500/25"
                    : HEADER_BUTTON_IDLE,
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
                    className={`${HEADER_BUTTON} ${HEADER_BUTTON_IDLE}`}
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
                        tone="danger"
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

/**
 * 加载占位：直接用 EntityCard 的骨架，和真卡片同一个外观、内边距与行节奏，数据到达时不跳动。
 * 以前手写了一张带描边和自定义投影的卡片，和真卡片对不上。
 */
export function ProviderCardSkeleton({ dense = false }: { dense?: boolean }) {
  return <EntityCardSkeleton dense={dense} headerRows={1} />;
}
