import { useTranslation } from "react-i18next";
import { ArrowDownWideNarrow, ArrowUpNarrowWide, ArrowUpAZ, Loader2 } from "lucide-react";
import { Button, DropdownMenu } from "@code-proxy/ui";
import {
  AUTH_FILES_SORT_MODES,
  useAuthFilesSortLoading,
  useAuthFilesSortMode,
  type AuthFilesSortMode,
} from "../hooks/useAuthFilesQuotaSort";

const MODE_LABEL_KEYS: Record<AuthFilesSortMode, string> = {
  name: "auth_files.sort_by_name",
  quota_asc: "auth_files.sort_quota_asc",
  quota_desc: "auth_files.sort_quota_desc",
};

const MODE_ICONS: Record<AuthFilesSortMode, typeof ArrowUpAZ> = {
  name: ArrowUpAZ,
  quota_asc: ArrowUpNarrowWide,
  quota_desc: ArrowDownWideNarrow,
};

/**
 * Sort control for the AI accounts list.
 *
 * Reads the shared preference rather than taking it as a prop: both the page
 * component and the files tab are frozen at their size baselines, and the list
 * reads the same value independently to order accounts ahead of pagination.
 */
export function AuthFilesQuotaSortMenu() {
  const { t } = useTranslation();
  const { mode, setMode } = useAuthFilesSortMode();
  const loading = useAuthFilesSortLoading();
  const ActiveIcon = MODE_ICONS[mode];

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button
          variant="secondary"
          size="sm"
          className="h-8! px-2 text-xs"
          data-testid="auth-files-sort-trigger"
          aria-label={t("auth_files.sort_label")}
        >
          {loading ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <ActiveIcon size={14} />
          )}
          {t(MODE_LABEL_KEYS[mode])}
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6}>
          {AUTH_FILES_SORT_MODES.map((candidate) => {
            const Icon = MODE_ICONS[candidate];
            return (
              <DropdownMenu.Item
                key={candidate}
                onSelect={() => setMode(candidate)}
                data-testid={`auth-files-sort-${candidate}`}
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
