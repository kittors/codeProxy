import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY_OPEN_GROUPS = "cli-proxy-sidebar-open-groups";

function readStoredGroups(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY_OPEN_GROUPS) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

/**
 * 侧边栏里多页分区的展开状态。
 *
 * - 手动展开 / 收起的结果记在 localStorage，刷新后保持原样；
 * - 当前页所在的分区总会被自动展开：从别处跳进一个收着的分区，用户应当看到自己落在哪一页。
 *   只在「当前分区变了」时展开一次——用户在当前分区里手动收起，不会被立刻又撑开；
 * - 第一次打开（没有存储）时只展开当前分区，其余收起，免得一屏放不下。
 */
export function useOpenGroups(activeGroupId: string | null) {
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(() => {
    const initial = new Set(readStoredGroups());
    if (activeGroupId) initial.add(activeGroupId);
    return initial;
  });

  useEffect(() => {
    if (!activeGroupId) return;
    setOpenIds((prev) => (prev.has(activeGroupId) ? prev : new Set(prev).add(activeGroupId)));
  }, [activeGroupId]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_OPEN_GROUPS, JSON.stringify([...openIds]));
    } catch {
      // 忽略持久化失败：展开状态只是偏好，不影响导航本身
    }
  }, [openIds]);

  const toggleGroup = useCallback((id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  return { openIds, toggleGroup };
}
