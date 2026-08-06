import { describe, expect, test } from "vitest";
import { shouldAdoptRotation } from "../authRotation";

const rotated = (rotationSeq: number, accountId?: string) =>
  ({ type: "token-rotated", rotationSeq, ...(accountId ? { accountId } : {}) }) as const;

describe("shouldAdoptRotation", () => {
  test("adopts a newer rotation from the same account", () => {
    expect(
      shouldAdoptRotation({
        currentAccountId: "user-1",
        message: rotated(3, "user-1"),
        localRotationSeq: 2,
      }),
    ).toBe(true);
  });

  test("ignores a rotation belonging to a different account", () => {
    expect(
      shouldAdoptRotation({
        currentAccountId: "user-1",
        message: rotated(9, "user-2"),
        localRotationSeq: 2,
      }),
    ).toBe(false);
  });

  // Own rotations echo back through the channel; re-applying one would overwrite
  // a newer token this tab already holds.
  test("ignores a rotation this tab already applied", () => {
    expect(
      shouldAdoptRotation({
        currentAccountId: "user-1",
        message: rotated(2, "user-1"),
        localRotationSeq: 2,
      }),
    ).toBe(false);
  });

  test("adopts when neither side names an account", () => {
    expect(
      shouldAdoptRotation({ currentAccountId: null, message: rotated(1), localRotationSeq: 0 }),
    ).toBe(true);
  });

  // A legacy snapshot written before rotationSeq existed reads as 0, so the very
  // first rotation after an upgrade still propagates.
  test("treats a missing local sequence as zero", () => {
    expect(
      shouldAdoptRotation({ currentAccountId: "user-1", message: rotated(1), localRotationSeq: 0 }),
    ).toBe(true);
  });
});
