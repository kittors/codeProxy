import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { identityApi, type AuditLogIdentity } from "@code-proxy/api-client";

export function AuditLogsPage() {
  const { t } = useTranslation();
  const [items, setItems] = useState<AuditLogIdentity[]>([]);
  useEffect(() => {
    void identityApi.auditLogs().then((response) => setItems(response.items ?? []));
  }, []);
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-950 dark:text-white">
          {t("identity_admin.audit_logs_title")}
        </h2>
        <p className="text-sm text-slate-500">{t("identity_admin.audit_logs_description")}</p>
      </div>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500 dark:bg-white/5">
            <tr>
              <th className="p-4">{t("identity_admin.time")}</th>
              <th>{t("identity_admin.actor")}</th>
              <th>{t("identity_admin.action")}</th>
              <th>{t("identity_admin.resource")}</th>
              <th>{t("identity_admin.result")}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-t border-slate-100 dark:border-neutral-800">
                <td className="p-4">{new Date(item.created_at).toLocaleString()}</td>
                <td>{item.actor_user_id ?? item.actor_kind}</td>
                <td>{item.action}</td>
                <td>
                  {item.resource_type}
                  {item.resource_id ? ` · ${item.resource_id}` : ""}
                </td>
                <td>{item.result}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
