/**
 * 页码条要显示哪些页：七页以内全列；更多时首页、末页、当前页左右各一页，中间用省略号。
 * （从旧 PaginationBar 移过来，旧组件已删。）
 */
export const getPaginationItems = (
  currentPage: number,
  totalPages: number,
): (number | "...")[] => {
  const safeTotalPages = Math.max(1, Math.trunc(totalPages));
  const safeCurrentPage = Math.min(safeTotalPages, Math.max(1, Math.trunc(currentPage)));
  const pages: (number | "...")[] = [];

  if (safeTotalPages <= 7) {
    for (let i = 1; i <= safeTotalPages; i += 1) pages.push(i);
    return pages;
  }

  pages.push(1);
  if (safeCurrentPage > 3) pages.push("...");

  const rangeStart = Math.max(2, safeCurrentPage - 1);
  const rangeEnd = Math.min(safeTotalPages - 1, safeCurrentPage + 1);
  for (let i = rangeStart; i <= rangeEnd; i += 1) pages.push(i);

  if (safeCurrentPage < safeTotalPages - 2) pages.push("...");
  pages.push(safeTotalPages);

  return pages;
};
