import { Plus, RefreshCw } from "lucide-react";
import type { EndUserAPIKey } from "@code-proxy/api-client";
import { Button, Card } from "@code-proxy/ui";
import { OwnedApiKeysTable } from "@features/period-spending";
import { PortalRecentSignIns } from "./PortalRecentSignIns";

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
  onResetPeriodSpending,
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
  onResetPeriodSpending: (key: EndUserAPIKey) => void;
}) {
  // 「管理 API Key」页签就是页面本身（flat）：操作按钮、Key 表格直接落在页面上，最近登录是下面
  // 唯一的一张卡片。以前整页包在一张卡里，按钮行和表格之间再画一道分隔线。
  return (
    <Card flat bodyClassName="mt-0">
      <div
        data-testid="apikey-lookup-keys-card-toolbar"
        className="flex flex-wrap items-center justify-end gap-2 pb-3"
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
        className="relative min-h-[360px] h-[calc(100dvh-240px)] overflow-hidden"
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
            onResetPeriodSpending,
          }}
        />
      </div>
      <PortalRecentSignIns />
    </Card>
  );
}
