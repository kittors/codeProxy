import type { DataTableSortValue } from "./DataTable.types";

export function isEmptySortValue(value: DataTableSortValue) {
  return value === null || value === undefined || (typeof value === "string" && !value.trim());
}

export function compareSortValues(
  left: DataTableSortValue,
  right: DataTableSortValue,
  collator: Intl.Collator,
) {
  const leftEmpty = isEmptySortValue(left);
  const rightEmpty = isEmptySortValue(right);
  if (leftEmpty || rightEmpty) {
    if (leftEmpty && rightEmpty) return 0;
    return leftEmpty ? 1 : -1;
  }
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }
  return collator.compare(String(left), String(right));
}

export function moveRow<T>(rows: readonly T[], fromIndex: number, toIndex: number): T[] {
  const next = Array.from(rows);
  const [moved] = next.splice(fromIndex, 1);
  if (moved === undefined) return next;
  next.splice(toIndex, 0, moved);
  return next;
}
