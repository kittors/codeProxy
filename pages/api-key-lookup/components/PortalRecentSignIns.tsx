import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ShieldCheck } from "lucide-react";
import { portalApi, type PortalAttempt } from "@code-proxy/api-client";
import { Card } from "@code-proxy/ui";

/**
 * The customer-facing half of the attempt log.
 *
 * When an end user asks "was that login me" or "why is my quota gone", the
 * answer should not require a support ticket and an operator running a query.
 * The server derives the account from the session, so this can only ever show
 * the caller's own records, and the addresses arrive partially masked: enough to
 * recognise a location, not enough to hand a stolen session a recon feed.
 */
export function PortalRecentSignIns() {
  const { t, i18n } = useTranslation();
  const [items, setItems] = useState<PortalAttempt[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await portalApi.attempts({ size: 10 });
      setItems(response.items ?? []);
    } catch {
      // A failure here must not disturb key management, which is what the user
      // actually came for; the empty state covers it.
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return null;

  return (
    <Card className="mt-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
        <ShieldCheck size={16} className="text-ink-3" aria-hidden="true" />
        {t("ip_access.portal_recent_logins")}
      </h3>
      <p className="mt-0.5 text-xs text-ink-3">{t("ip_access.portal_recent_logins_hint")}</p>

      {items.length === 0 ? (
        <p className="mt-3 text-sm text-ink-3">{t("ip_access.portal_no_logins")}</p>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {items.map((item, index) => (
            <li
              key={`${item.occurred_at}-${index}`}
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2 text-sm"
            >
              <span className="text-ink-2">
                {new Date(item.occurred_at).toLocaleString(i18n.language)}
              </span>
              <span className="font-mono text-xs text-ink-2">{item.ip}</span>
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                  item.outcome === "success"
                    ? "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300"
                    : "bg-rose-500/10 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300"
                }`}
              >
                {t(`ip_access.outcome_${item.outcome}`, { defaultValue: item.outcome })}
              </span>
              <span className="max-w-full truncate text-xs text-ink-3">{item.user_agent}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
