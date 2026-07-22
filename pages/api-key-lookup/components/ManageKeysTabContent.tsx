import type { EndUserAPIKey } from "@code-proxy/api-client";
import { OwnedApiKeysTable } from "@features/period-spending";

export function ManageKeysTabContent({
  t,
  keys,
  busy,
  onRotate,
  onDelete,
  onEdit,
  onResetDailySpending,
  onViewResetHistory,
}: {
  t: (key: string, options?: Record<string, unknown>) => string;
  keys: EndUserAPIKey[];
  busy?: boolean;
  onRotate: (key: EndUserAPIKey) => void;
  onDelete: (key: EndUserAPIKey) => void;
  onEdit: (key: EndUserAPIKey) => void;
  onResetDailySpending: (key: EndUserAPIKey) => void;
  onViewResetHistory: (key: EndUserAPIKey) => void;
}) {
  return (
    <OwnedApiKeysTable
      t={t}
      keys={keys}
      busy={busy}
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
  );
}
