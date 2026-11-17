import { describe, expect, test } from "vitest";
import { getPaginationItems } from "../gridPagination";

describe("getPaginationItems", () => {
  test("七页以内全列，更多时首末页加当前页左右各一页", () => {
    expect(getPaginationItems(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(getPaginationItems(1, 10)).toEqual([1, 2, "...", 10]);
    expect(getPaginationItems(5, 10)).toEqual([1, "...", 4, 5, 6, "...", 10]);
    expect(getPaginationItems(10, 10)).toEqual([1, "...", 9, 10]);
  });

  test("页码越界时收回到有效范围", () => {
    expect(getPaginationItems(0, 0)).toEqual([1]);
    expect(getPaginationItems(99, 3)).toEqual([1, 2, 3]);
  });
});
