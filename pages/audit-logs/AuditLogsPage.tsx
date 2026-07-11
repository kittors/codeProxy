import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { identityApi, type AuditLogIdentity } from "@code-proxy/api-client";
import { DataTable, type DataTableColumn } from "@code-proxy/ui";

export function AuditLogsPage() {
  const { t } = useTranslation();
  const [items, setItems] = useState<AuditLogIdentity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void identityApi
      .auditLogs()
      .then((response) => setItems(response.items ?? []))
      .finally(() => setLoading(false));
  }, []);

  const columns = useMemo<DataTableColumn<AuditLogIdentity>[]>(
    () => [
      {
        key: "time",
        label: t("identity_admin.time"),
        width: "w-52",
        render: (item) => new Date(item.created_at).toLocaleString(),
      },
      {
        key: "actor",
        label: t("identity_admin.actor"),
        width: "w-52",
        render: (item) => item.actor_user_id ?? item.actor_kind,
      },
      {
        key: "action",
        label: t("identity_admin.action"),
        width: "w-52",
        render: (item) => item.action,
      },
      {
        key: "resource",
        label: t("identity_admin.resource"),
        render: (item) =>
          `${item.resource_type}${item.resource_id ? ` · ${item.resource_id}` : ""}`,
      },
      {
        key: "result",
        label: t("identity_admin.result"),
        width: "w-32",
        render: (item) => item.result,
      },
    ],
    [t],
  );

  return (
    <section className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col rounded-2xl border border-black/[0.06] bg-white shadow-[0_1px_2px_rgb(15_23_42_/_0.035)] dark:border-white/[0.06] dark:bg-neutral-950/70 dark:shadow-[0_1px_2px_rgb(0_0_0_/_0.22)]">
        <div className="px-5 pt-5 pb-3">
          <h2 className="text-base font-semibold text-slate-950 dark:text-white">
            {t("identity_admin.audit_logs_title")}
          </h2>
          <p className="text-sm text-slate-500">{t("identity_admin.audit_logs_description")}</p>
        </div>
        <div className="relative h-[calc(100dvh-250px)] min-h-[360px] overflow-hidden px-5 pb-5">
          <DataTable<AuditLogIdentity>
            tableId="identity-audit-logs"
            rows={items}
            columns={columns}
            rowKey={(item) => String(item.id)}
            loading={loading}
            virtualize={false}
            height="h-full"
            minHeight="min-h-full"
            minWidth="min-w-[900px]"
            emptyText={t("identity_admin.no_audit_logs")}
            showAllLoadedMessage={false}
          />
        </div>
      </div>
    </section>
  );
}
