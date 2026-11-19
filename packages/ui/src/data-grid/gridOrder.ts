/**
 * 列顺序与行顺序的纯函数（拖动换列、拖动排行共用）。
 */

/**
 * 存下来的列顺序与当前列定义合并：存储里已经没有的列丢掉；页面后来才有的列
 * （例如等能力探测回来才出现的 Agent 列）插到「定义里排在它前面、已在顺序里」的那一列之后，
 * 落在页面想要的位置，而不是被甩到最后。没存过就是定义顺序。
 */
export function mergeColumnOrder(
  definitionIds: readonly string[],
  stored: readonly string[] | null | undefined,
): string[] {
  if (!stored || stored.length === 0) return [...definitionIds];
  const known = new Set(definitionIds);
  const result: string[] = [];
  for (const id of stored) {
    if (known.has(id) && !result.includes(id)) result.push(id);
  }
  definitionIds.forEach((id, index) => {
    if (result.includes(id)) return;
    let insertAt = 0;
    for (let previous = index - 1; previous >= 0; previous -= 1) {
      const position = result.indexOf(definitionIds[previous]);
      if (position >= 0) {
        insertAt = position + 1;
        break;
      }
    }
    result.splice(insertAt, 0, id);
  });
  return result;
}

/** 把 columnId 挪到 beforeId 前面；beforeId 为 null 表示挪到最后。 */
export function moveColumnBefore(
  order: readonly string[],
  columnId: string,
  beforeId: string | null,
): string[] {
  if (columnId === beforeId) return [...order];
  const next = order.filter((id) => id !== columnId);
  const position = beforeId === null ? -1 : next.indexOf(beforeId);
  if (position < 0) next.push(columnId);
  else next.splice(position, 0, columnId);
  return next;
}

/** 行从 fromIndex 移到 toIndex（toIndex 是移动后它所在的位置）。 */
export function moveGridRow<T>(rows: readonly T[], fromIndex: number, toIndex: number): T[] {
  const next = [...rows];
  if (fromIndex < 0 || fromIndex >= next.length) return next;
  const [moved] = next.splice(fromIndex, 1);
  next.splice(Math.max(0, Math.min(next.length, toIndex)), 0, moved);
  return next;
}

/**
 * 拖动时的落点：指针在哪个格子的前半段就插到它前面，过了最后一个格子的中线就是「最后」。
 * 返回 null 表示放回原处（落点就是它自己或紧挨着的下一个），这时不画插入线、松手也不改。
 */
export function findDropTarget(
  items: readonly { id: string; start: number; end: number }[],
  sourceId: string,
  pointer: number,
): { beforeId: string | null; edge: number } | null {
  if (items.length === 0) return null;
  let beforeId: string | null = null;
  let edge = items[items.length - 1].end;
  for (const item of items) {
    if (pointer < (item.start + item.end) / 2) {
      beforeId = item.id;
      edge = item.start;
      break;
    }
  }
  const sourceIndex = items.findIndex((item) => item.id === sourceId);
  const nextId = sourceIndex >= 0 ? (items[sourceIndex + 1]?.id ?? null) : undefined;
  if (beforeId === sourceId || beforeId === nextId) return null;
  return { beforeId, edge };
}
