import { motion, useReducedMotion } from "framer-motion";
import { Loader2, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { VendorIcon } from "@code-proxy/assets";
import { Button } from "@code-proxy/ui";

const EASE = [0.16, 1, 0.3, 1] as const;

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
  const reduceMotion = useReducedMotion();
  return (
    <div className="grid min-h-full place-items-center px-6 py-10">
      <div className="grid w-full max-w-sm justify-items-center text-center">
        <div className="relative grid h-20 w-20 place-items-center">
          {reduceMotion ? null : (
            <motion.span
              aria-hidden="true"
              className="absolute inset-0 rounded-full bg-emerald-500/25"
              initial={{ scale: 0.6, opacity: 0.9 }}
              animate={{ scale: 1.9, opacity: 0 }}
              transition={{ duration: 0.9, ease: "easeOut", delay: 0.15 }}
            />
          )}
          <motion.span
            className="grid h-16 w-16 place-items-center rounded-full bg-emerald-500 text-white shadow-lift"
            initial={reduceMotion ? false : { scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 420, damping: 22 }}
          >
            <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" aria-hidden="true">
              <motion.path
                d="M5 12.5l4.5 4.5L19 7.5"
                stroke="currentColor"
                strokeWidth={2.6}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={reduceMotion ? false : { pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.45, ease: EASE, delay: 0.2 }}
              />
            </svg>
          </motion.span>
        </div>

        <motion.div
          className="mt-6 grid justify-items-center gap-2"
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: EASE, delay: 0.3 }}
        >
          <h3 className="text-lg font-semibold text-ink">{title}</h3>
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
          <p className="text-sm text-ink-2">{t("add_account.success.ready")}</p>
        </motion.div>

        <motion.div
          className="mt-7 flex flex-wrap items-center justify-center gap-2.5"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.45 }}
        >
          <Button variant="default" onClick={onAddAnother}>
            <Plus size={15} aria-hidden="true" />
            {t("add_account.success.add_another")}
          </Button>
          <Button autoFocus variant="primary" onClick={onDone}>
            {t("add_account.success.done")}
          </Button>
        </motion.div>
      </div>
    </div>
  );
}
