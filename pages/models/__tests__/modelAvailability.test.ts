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

  test("normalizes model source details from configured availability", () => {
    const availability = normalizeConfiguredModelAvailability({
      scoped: true,
      data: [
        {
          id: "gpt-5",
          sources: [
            {
              label: "codex · Codex Pro",
              provider: "codex",
              channel: "Codex Pro",
              client_id: "codex-1",
            },
          ],
        },
      ],
    });

    expect(availability.items[0]?.sources).toEqual([
      {
        label: "codex · Codex Pro",
        provider: "codex",
        channel: "Codex Pro",
        clientId: "codex-1",
      },
    ]);
  });
});
