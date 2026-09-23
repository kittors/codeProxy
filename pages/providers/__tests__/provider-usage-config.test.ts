import { describe, expect, test } from "vitest";
import { migrateProviderUsageCache } from "../provider-usage-config";

const reading = {
  usage: [{ type: "rolling", label: "Rolling", percentage: 25, resets_in: "30m" }],
  updatedAt: 1,
};

describe("migrateProviderUsageCache", () => {
  // The release before the API-key usage check scoped OpenCode Go readings by
  // workspace id. Rewriting that segment keeps the cached reading on the card
  // after the upgrade instead of blanking it until someone refreshes.
  test("rescopes a workspace-keyed OpenCode Go reading to the API key", () => {
    expect(
      migrateProviderUsageCache({ "opencode-go:wrk_123:OpenCode Go:0": reading }),
    ).toEqual({ "opencode-go:apikey:OpenCode Go:0": reading });
  });

  test("files the oldest unprefixed keys under OpenCode Go", () => {
    expect(migrateProviderUsageCache({ "wrk_123:OpenCode Go:0": reading })).toEqual({
      "opencode-go:apikey:OpenCode Go:0": reading,
    });
  });

  test("leaves other channels and already migrated keys as they are", () => {
    const cached = {
      "opencode-go:apikey:OpenCode Go:0": reading,
      "cline:dashboard:Cline:0": reading,
      "ollama-cloud:dashboard:Ollama:0": reading,
      "commandcode:apikey:Command Code:1": reading,
    };
    expect(migrateProviderUsageCache(cached)).toEqual(cached);
  });
});
