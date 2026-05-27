import { useState, type ReactNode } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { EllipsisVertical, Settings2, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { buttonClassName } from "@/modules/ui/Button";
import { ToggleSwitch } from "@/modules/ui/ToggleSwitch";

const ACTION_MENU_CONTENT_CLASS =
  "z-[220] min-w-36 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-900/10 dark:border-neutral-800 dark:bg-neutral-950 dark:shadow-black/35";
const ACTION_MENU_ITEM_CLASS =
  "flex w-full cursor-default select-none items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 outline-none transition-colors focus:bg-slate-100 data-[highlighted]:bg-slate-100 dark:text-white/75 dark:focus:bg-white/10 dark:data-[highlighted]:bg-white/10";
const ACTION_MENU_DANGER_ITEM_CLASS =
  "flex w-full cursor-default select-none items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-rose-600 outline-none transition-colors focus:bg-rose-50 data-[highlighted]:bg-rose-50 dark:text-rose-300 dark:focus:bg-rose-500/10 dark:data-[highlighted]:bg-rose-500/10";

export interface ProviderCardProps {
  /** Card title (provider name) */
  title: string;
  /** Whether the card is selected for batch operations */
  selected?: boolean;
  /** Whether the provider is enabled */
  enabled?: boolean;
  /** Whether the card should appear dimmed (disabled state) */
  dimmed?: boolean;
  /** Callback when selection checkbox changes */
  onToggleSelected?: (checked: boolean) => void;
  /** Callback when enabled toggle changes */
  onToggleEnabled?: (enabled: boolean) => void;
  /** Callback when edit button is clicked */
  onEdit?: () => void;
  /** Callback when delete button is clicked */
  onDelete?: () => void;
  /** Extra elements rendered below the title row */
  headerExtra?: ReactNode;
  /** Card body content */
  children?: ReactNode;
}

export function ProviderCard({
  title,
  selected = false,
  enabled = true,
  dimmed = false,
  onToggleSelected,
  onToggleEnabled,
  onEdit,
  onDelete,
  headerExtra,
  children,
}: ProviderCardProps) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const hasActionMenu = Boolean(onEdit || onDelete);
  const hasHeaderExtra = Boolean(headerExtra);

  return (
    <div
      className={[
        "group relative rounded-2xl border px-4 py-3 shadow-sm transition-all duration-200 ease-out",
        hasActionMenu ? "pr-11" : "",
        selected
          ? "border-blue-400 bg-blue-50/50 ring-1 ring-blue-200 dark:border-blue-500/50 dark:bg-blue-950/20 dark:ring-blue-500/20"
          : "border-slate-200 bg-white/70 hover:border-slate-300 hover:bg-white hover:shadow-md dark:border-neutral-800 dark:bg-neutral-950/60 dark:hover:border-neutral-700 dark:hover:bg-neutral-950/80 dark:hover:shadow-lg dark:hover:shadow-black/20",
        dimmed ? "opacity-50" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {hasActionMenu ? (
        <DropdownMenu.Root open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              className={[
                buttonClassName({
                  variant: "ghost",
                  size: "xs",
                  iconOnly: true,
                  className:
                    "!h-7 !w-7 bg-white/85 text-slate-500 shadow-sm ring-1 ring-slate-200/80 hover:text-slate-950 dark:bg-neutral-950/85 dark:text-white/55 dark:ring-neutral-800 dark:hover:text-white",
                }),
                "absolute right-2 top-2 z-10 transition-opacity duration-150 ease-out",
                menuOpen
                  ? "pointer-events-auto opacity-100"
                  : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100",
              ].join(" ")}
              aria-label={t("providers.more_actions")}
              title={t("providers.more_actions")}
              data-tooltip-placement="left"
            >
              <EllipsisVertical size={14} />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="end" sideOffset={8} className={ACTION_MENU_CONTENT_CLASS}>
              {onEdit ? (
                <DropdownMenu.Item className={ACTION_MENU_ITEM_CLASS} onSelect={() => onEdit()}>
                  <Settings2 size={15} />
                  <span>{t("providers.edit")}</span>
                </DropdownMenu.Item>
              ) : null}
              {onDelete ? (
                <DropdownMenu.Item
                  className={ACTION_MENU_DANGER_ITEM_CLASS}
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

      {/* Header */}
      <div className="grid gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {onToggleSelected ? (
            <div
              className={[
                "flex items-center justify-center overflow-hidden transition-[width,opacity] duration-200 ease-out",
                selected
                  ? "w-7 opacity-100"
                  : "w-0 opacity-0 group-hover:w-7 group-hover:opacity-100",
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
          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900 dark:text-white">
            {title}
          </p>
          {onToggleEnabled ? (
            <div className="shrink-0">
              <ToggleSwitch
                checked={enabled}
                ariaLabel={`${t("providers.enable_provider")} ${title}`}
                onCheckedChange={onToggleEnabled}
              />
            </div>
          ) : null}
        </div>
        {hasHeaderExtra ? (
          <div className="flex flex-wrap items-center justify-end gap-2">{headerExtra}</div>
        ) : null}
      </div>

      {/* Content */}
      {children ? <div className="mt-2 min-w-0">{children}</div> : null}
    </div>
  );
}
