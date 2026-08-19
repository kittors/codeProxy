import { useTranslation } from "react-i18next";
import { Select } from "@code-proxy/ui";
import {
  AUTH_FILES_SORT_MODES,
  isAuthFilesSortMode,
  useAuthFilesSortLoading,
  useAuthFilesSortMode,
  type AuthFilesSortMode,
} from "../hooks/useAuthFilesQuotaSort";

const MODE_LABEL_KEYS: Record<AuthFilesSortMode, string> = {
  name: "auth_files.sort_by_name",
  quota_asc: "auth_files.sort_quota_asc",
  quota_desc: "auth_files.sort_quota_desc",
};

/**
 * Sort control for the AI accounts list.
 *
 * Reads the shared preference rather than taking it as a prop: both
 * AuthFilesPage and AuthFilesFilesTab are frozen at their size baselines, and
 * the list reads the same value independently to order accounts ahead of
 * pagination.
 *
 * A Select rather than a dropdown menu, matching the column-count control it
 * sits beside — same affordance for the same kind of choice, and no second
 * popover implementation on this toolbar.
 */
export function AuthFilesQuotaSortMenu() {
  const { t } = useTranslation();
  const { mode, setMode } = useAuthFilesSortMode();
  const loading = useAuthFilesSortLoading();

  return (
    <div className="hidden lg:block" data-testid="auth-files-sort">
      <Select
        value={mode}
        onChange={(value) => {
          if (isAuthFilesSortMode(value)) setMode(value);
        }}
        options={AUTH_FILES_SORT_MODES.map((candidate) => ({
          value: candidate,
          label: t(MODE_LABEL_KEYS[candidate]),
        }))}
        aria-label={t("auth_files.sort_label")}
        variant="chip"
        size="sm"
        className="min-w-[8.5rem]"
        {...(loading ? { "data-loading": "true" } : {})}
      />
    </div>
  );
}
