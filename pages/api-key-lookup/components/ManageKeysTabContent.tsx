import { Plus, RefreshCw } from "lucide-react";
import type { EndUserAPIKey } from "@code-proxy/api-client";
import { Button, Card } from "@code-proxy/ui";
import { OwnedApiKeysTable } from "@features/period-spending";

export function ManageKeysTabContent({
  t,
  keys,
  busy,
  loading = false,
  onRefresh,
  onCreate,
  onRotate,
  onDelete,
  onEdit,
}: {
  t: (key: string, options?: Record<string, unknown>) => string;
  keys: EndUserAPIKey[];
  busy?: boolean;
  loading?: boolean;
  onRefresh: () => void;
  onCreate: () => void;
  onRotate: (key: EndUserAPIKey) => void;
  onDelete: (key: EndUserAPIKey) => void;
  onEdit: (key: EndUserAPIKey) => void;
}) {
  return (
    <Card padding="none" className="overflow-hidden" bodyClassName="mt-0">
      <div
        data-testid="apikey-lookup-keys-card-toolbar"
        className="flex flex-wrap items-center justify-end gap-2 border-b border-slate-100 px-3 py-3 sm:px-5 dark:border-neutral-800/60"
      >
        <Button size="sm" variant="secondary" onClick={onRefresh} disabled={loading || busy}>
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          {t("common.refresh")}
        </Button>
        <Button size="sm" variant="primary" onClick={onCreate} disabled={busy}>
          <Plus size={14} />
          {t("apikey_lookup.create_key", { defaultValue: "新建 Key" })}
        </Button>
      </div>

      <div
        data-testid="apikey-lookup-keys-table-viewport"
        className="relative min-h-[360px] h-[calc(100dvh-240px)] overflow-hidden px-3 sm:px-5"
      >
        <OwnedApiKeysTable
          t={t}
          keys={keys}
          busy={busy}
          loading={loading}
          canDelete={() => keys.length > 1}
          height="h-full"
          minHeight="min-h-full"
          actions={{
            onRotate,
            onDelete,
            onEdit,
          }}
        />
      </div>
    </Card>
  );
}
