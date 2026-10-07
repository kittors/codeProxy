import { Loader2, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { VendorIcon } from "@code-proxy/assets";
import { Button, ResultPanel } from "@code-proxy/ui";

/**
 * The end of a login says which account arrived, instead of a toast that
 * vanishes while the list is still refreshing behind the dialog.
 */
export function SuccessPanel({
  title,
  icon,
  account,
  resolvingAccount,
  details,
  onAddAnother,
  onDone,
}: {
  title: string;
  icon?: string;
  /** The account that was added, once the list has refreshed. */
  account?: string;
  /** The list is still refreshing; the account name follows. */
  resolvingAccount?: boolean;
  details?: string[];
  onAddAnother: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  return (
    <ResultPanel
      title={title}
      description={t("add_account.success.ready")}
      actions={
        <>
          <Button variant="default" onClick={onAddAnother}>
            <Plus size={15} aria-hidden="true" />
            {t("add_account.success.add_another")}
          </Button>
          <Button autoFocus variant="primary" onClick={onDone}>
            {t("add_account.success.done")}
          </Button>
        </>
      }
    >
      {account || resolvingAccount ? (
        <span className="inline-flex max-w-full items-center gap-2 rounded-full bg-subtle px-3 py-1.5 text-sm text-ink">
          {icon ? <VendorIcon modelId={icon} size={16} /> : null}
          {account ? (
            <span className="truncate font-medium">{account}</span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-ink-3">
              <Loader2 size={13} className="animate-spin" aria-hidden="true" />
              {t("add_account.success.resolving")}
            </span>
          )}
        </span>
      ) : null}
      {details?.length ? (
        <ul className="grid gap-0.5 text-xs text-ink-3">
          {details.map((line) => (
            <li key={line} className="truncate">
              {line}
            </li>
          ))}
        </ul>
      ) : null}
    </ResultPanel>
  );
}
