import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { PaginationBar, getPaginationItems } from "../PaginationBar";

describe("PaginationBar", () => {
  test("builds compact pagination items with ellipses", () => {
    expect(getPaginationItems(1, 10)).toEqual([1, 2, "...", 10]);
    expect(getPaginationItems(5, 10)).toEqual([1, "...", 4, 5, 6, "...", 10]);
    expect(getPaginationItems(10, 10)).toEqual([1, "...", 9, 10]);
  });

  test("renders page info and supports page navigation", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();

    render(
      <PaginationBar
        currentPage={2}
        totalPages={5}
        totalCount={43}
        pageSize={10}
        onPageChange={onPageChange}
        labels={{
          firstPage: "First page",
          previousPage: "Previous page",
          nextPage: "Next page",
          lastPage: "Last page",
          pageInfo: ({ start, end, total }) => `${start}-${end} of ${total}`,
        }}
      />,
    );

    expect(screen.getByText("11-20 of 43")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(onPageChange).toHaveBeenCalledWith(3);

    await user.click(screen.getByRole("button", { name: "Last page" }));
    expect(onPageChange).toHaveBeenCalledWith(5);
  });

  test("can be configured with page size controls", async () => {
    const user = userEvent.setup();
    const onPageSizeChange = vi.fn();

    render(
      <PaginationBar
        currentPage={1}
        totalPages={3}
        totalCount={120}
        pageSize={50}
        pageSizeOptions={[20, 50, 100]}
        onPageChange={vi.fn()}
        onPageSizeChange={onPageSizeChange}
        labels={{
          firstPage: "First page",
          previousPage: "Previous page",
          nextPage: "Next page",
          lastPage: "Last page",
          rowsPerPage: "Rows per page",
          pageInfo: ({ start, end, total }) => `${start}-${end} of ${total}`,
        }}
      />,
    );

    await user.click(screen.getByRole("combobox", { name: "Rows per page" }));
    await user.click(screen.getByRole("option", { name: "100" }));

    expect(onPageSizeChange).toHaveBeenCalledWith(100);
  });
});
