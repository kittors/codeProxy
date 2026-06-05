import { describe, expect, test } from "vitest";
import {
  filterByConfiguredModelAvailability,
  normalizeConfiguredModelAvailability,
} from "@features/model-availability";

describe("model availability normalization", () => {
  test("preserves an explicit scoped empty availability response", () => {
    const availability = normalizeConfiguredModelAvailability({
      scoped: true,
      data: [],
    });

    expect(availability.scoped).toBe(true);
    expect(availability.items).toEqual([]);
    expect(filterByConfiguredModelAvailability([{ id: "gpt-5" }], availability)).toEqual([]);
  });

  test("treats an unscoped empty response as unrestricted for older payload shapes", () => {
    const availability = normalizeConfiguredModelAvailability({});

    expect(availability.scoped).toBe(false);
    expect(filterByConfiguredModelAvailability([{ id: "gpt-5" }], availability)).toEqual([
      { id: "gpt-5" },
    ]);
  });
});
