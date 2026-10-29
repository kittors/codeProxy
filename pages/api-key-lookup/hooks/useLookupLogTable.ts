import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  buildRequestLogsColumns,
  requestLogsHaveCacheBreakdown,
  type RequestLogsRow,
} from "@features/request-log-viewer";
import { toLogRow } from "../toLogRow";
import type { PublicLogItem } from "../types";

/**
 * Rows and columns of the public lookup's log table. The cache-write column is
 * only added when the backend reports cache reads and writes apart; an older
 * backend's rows carry a single cached figure, shown in the cache column.
 */
export function useLookupLogTable(rawItems: PublicLogItem[]) {
  const { t } = useTranslation();
  const rows = useMemo<RequestLogsRow[]>(() => rawItems.map((item) => toLogRow(item)), [rawItems]);
  const cacheBreakdown = useMemo(() => requestLogsHaveCacheBreakdown(rows), [rows]);
  const logColumns = useMemo(
    () =>
      buildRequestLogsColumns((key) => t(key), undefined, undefined, {
        identityColumn: "key",
        hideChannel: true,
        cacheBreakdown,
      }),
    [t, cacheBreakdown],
  );
  return { rows, logColumns };
}
