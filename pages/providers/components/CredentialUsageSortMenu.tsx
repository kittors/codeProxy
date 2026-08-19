import { useTranslation } from "react-i18next";
import { ArrowDownWideNarrow, ArrowUpNarrowWide, ListOrdered } from "lucide-react";
import { Button, DropdownMenu } from "@code-proxy/ui";
import {
  CREDENTIAL_USAGE_SORT_MODES,
  type CredentialUsageSortMode,
} from "../provider-usage-sort";

const MODE_LABEL_KEYS: Record<CredentialUsageSortMode, string> = {
  config: "providers.credential_sort_config",
  remaining_asc: "providers.credential_sort_remaining_asc",
  remaining_desc: "providers.credential_sort_remaining_desc",
};

const MODE_ICONS: Record<CredentialUsageSortMode, typeof ListOrdered> = {
  config: ListOrdered,
  remaining_asc: ArrowUpNarrowWide,
  remaining_desc: ArrowDownWideNarrow,
};

/**
 * Sort control for a channel's credential cards.
 *
 * Only rendered for channels that report plan usage — sorting by remaining quota
 * is meaningless where no quota is reported, and an option that never changes
 * anything is worse than no option.
 */
export function CredentialUsageSortMenu({
  mode,
  onChange,
  disabled = false,
}: {
  mode: CredentialUsageSortMode;
  onChange: (mode: CredentialUsageSortMode) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const ActiveIcon = MODE_ICONS[mode];

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button
          variant="secondary"
          size="sm"
          className="h-8! px-2 text-xs"
          disabled={disabled}
          data-testid="credential-usage-sort-trigger"
          aria-label={t("providers.credential_sort_label")}
        >
          <ActiveIcon size={14} />
          {t(MODE_LABEL_KEYS[mode])}
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="start" sideOffset={6}>
          {CREDENTIAL_USAGE_SORT_MODES.map((candidate) => {
            const Icon = MODE_ICONS[candidate];
            return (
              <DropdownMenu.Item
                key={candidate}
                onSelect={() => onChange(candidate)}
                data-testid={`credential-usage-sort-${candidate}`}
              >
                <Icon size={14} />
                <span className={candidate === mode ? "font-semibold" : undefined}>
                  {t(MODE_LABEL_KEYS[candidate])}
                </span>
              </DropdownMenu.Item>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
