import type { ReactNode } from "react";
import { Settings2, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/modules/ui/Button";
import { ToggleSwitch } from "@/modules/ui/ToggleSwitch";

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
  /** Extra elements rendered in the header actions area (between toggle and edit) */
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

  return (
    <div
      className={[
        "group rounded-2xl border px-4 py-3 shadow-sm transition-all duration-200 ease-out",
        selected
          ? "border-blue-400 bg-blue-50/50 ring-1 ring-blue-200 dark:border-blue-500/50 dark:bg-blue-950/20 dark:ring-blue-500/20"
          : "border-slate-200 bg-white/70 hover:border-slate-300 hover:bg-white hover:shadow-md dark:border-neutral-800 dark:bg-neutral-950/60 dark:hover:border-neutral-700 dark:hover:bg-neutral-950/80 dark:hover:shadow-lg dark:hover:shadow-black/20",
        dimmed ? "opacity-50" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2">
        {onToggleSelected ? (
          <div
            className={[
              "flex items-center justify-center overflow-hidden transition-all duration-200 ease-out",
              selected
                ? "w-8 opacity-100"
                : "w-0 opacity-0 group-hover:w-8 group-hover:opacity-100",
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
        <div className="ml-auto flex items-center gap-2">
          {headerExtra}
          {onToggleEnabled ? (
            <ToggleSwitch
              checked={enabled}
              ariaLabel={`${t("providers.enable_provider")} ${title}`}
              onCheckedChange={onToggleEnabled}
            />
          ) : null}
          {onEdit ? (
            <Button variant="secondary" size="sm" onClick={onEdit}>
              <Settings2 size={14} />
              {t("providers.edit")}
            </Button>
          ) : null}
          {onDelete ? (
            <Button variant="danger" size="sm" onClick={onDelete}>
              <Trash2 size={14} />
              {t("providers.delete")}
            </Button>
          ) : null}
        </div>
      </div>

      {/* Content */}
      {children ? <div className="mt-2 min-w-0">{children}</div> : null}
    </div>
  );
}
