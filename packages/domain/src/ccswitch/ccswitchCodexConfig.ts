/**
 * The reasoning effort for a Codex model the backend's catalog has nothing to say about.
 * It is also what CC Switch v4.0.9 and earlier write for every imported Codex provider.
 */
export const CC_SWITCH_CODEX_FALLBACK_REASONING_EFFORT = "high";

export function resolveCcSwitchCodexReasoningEffort(
  model: string,
  efforts: Record<string, string> | undefined,
): string {
  const key = model.trim().toLowerCase();
  return (key && efforts?.[key]?.trim()) || CC_SWITCH_CODEX_FALLBACK_REASONING_EFFORT;
}

/** A TOML basic string. JSON escapes (`\"`, `\\`, `\n`, `\uXXXX`) are valid TOML escapes. */
const tomlString = (value: string) => JSON.stringify(value);

/**
 * The `config.toml` a Codex link carries.
 *
 * CC Switch v4.0.10 keeps only whitelisted keys from it: the selected
 * `[model_providers.*]` table (renamed to `custom`) and top-level model fields such as
 * `model_reasoning_effort` and `model_context_window`. `model_catalog_json` is not on that
 * list, and `cc-switch-model-catalog.json` is the catalog CC Switch generates itself, so
 * the link must not point at one. v4.0.9 and earlier read only the address, key and model
 * and rebuild the file from a fixed template, so everything here degrades gracefully.
 * Order follows CC Switch's own projection: model fields first, the provider table last.
 */
export function buildCcSwitchCodexConfigToml(input: {
  model: string;
  reasoningEffort: string;
  contextWindow: number | null;
  providerName: string;
  endpoint: string;
  /**
   * Render the provider table the way CC Switch v4.0.10 writes it into ~/.codex/config.toml
   * rather than the way the link carries it (live/project/codex.rs): `auth.json` is kept for
   * the official login, so the key goes into the table as `experimental_bearer_token`, and
   * `requires_openai_auth` is decided at write time — true only when this computer is signed
   * in to ChatGPT. `loginNote` explains that on a TOML comment line.
   */
  written?: { bearerToken: string; loginNote: string };
}): string {
  const model = input.model.trim();
  const lines = [
    `model_provider = "custom"`,
    // Without a model CC Switch falls back to its own default; an empty string would not help.
    ...(model ? [`model = ${tomlString(model)}`] : []),
    `model_reasoning_effort = ${tomlString(input.reasoningEffort)}`,
    "disable_response_storage = true",
  ];
  if (input.contextWindow && input.contextWindow > 0) {
    lines.push(`model_context_window = ${Math.round(input.contextWindow)}`);
  }
  lines.push(
    "",
    "[model_providers.custom]",
    `name = ${tomlString(input.providerName)}`,
    `base_url = ${tomlString(input.endpoint)}`,
    `wire_api = "responses"`,
  );
  if (input.written) {
    lines.push(
      `# ${input.written.loginNote}`,
      "requires_openai_auth = false",
      `experimental_bearer_token = ${tomlString(input.written.bearerToken)}`,
    );
  } else {
    // CC Switch v4.0.9 and earlier rebuild the file from a template with this same value.
    lines.push("requires_openai_auth = true");
  }
  return lines.join("\n");
}
