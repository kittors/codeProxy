import type { EndUserAPIKey } from "@code-proxy/api-client";
import { Card } from "@code-proxy/ui";
import { OwnedApiKeysTable } from "@features/period-spending";

export function ManageKeysTabContent({
  t,
  keys,
  busy,
  loading = false,
  onRotate,
  onDelete,
  onEdit,
  onResetDailySpending,
  onViewResetHistory,
}: {
  t: (key: string, options?: Record<string, unknown>) => string;
  keys: EndUserAPIKey[];
  busy?: boolean;
  loading?: boolean;
  onRotate: (key: EndUserAPIKey) => void;
  onDelete: (key: EndUserAPIKey) => void;
  onEdit: (key: EndUserAPIKey) => void;
  onResetDailySpending: (key: EndUserAPIKey) => void;
  onViewResetHistory: (key: EndUserAPIKey) => void;
}) {
  return (
    <Card padding="none" className="overflow-hidden" bodyClassName="mt-0">
      <div className="relative min-h-[320px] overflow-hidden px-3 sm:px-5">
        <OwnedApiKeysTable
          t={t}
          keys={keys}
          busy={busy}
          loading={loading}
          canDelete={() => keys.length > 1}
          height="h-[min(58vh,540px)]"
          actions={{
            onRotate,
            onDelete,
            onEdit,
            onResetDailySpending,
            onViewResetHistory,
          }}
        />
      </div>
    </Card>
  );
}
