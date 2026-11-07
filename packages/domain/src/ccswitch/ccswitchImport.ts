import type { CcSwitchImportPlan } from "./ccswitchImportPlan";

/**
 * CC Switch provider deep links (`ccswitch://v1/import?resource=provider&…`).
 *
 * Rules the desktop app imposes, checked against CC Switch v4.0.10
 * (src-tauri/src/deeplink/{parser,provider,codex_link}.rs):
 * - Parameters are camelCase and case-sensitive; unknown ones are ignored, so `apiKeyField`,
 *   `fableModel`, `modelCatalog` and the like never had any effect.
 * - An empty value is not "unset": `model=` imports an empty model name (and Claude Code
 *   copies it into every tier), and an empty `config` / `usageScript` fails the whole
 *   import. Empty parameters are left out, and `configFormat` only travels with `config`.
 * - Values go through URLSearchParams: a Base64 `+` in a key or script must become `%2B`.
 * - Windows caps the command line CC Switch receives at about 32k characters, so the link
 *   carries nothing CC Switch would throw away.
 */
export function encodeCcSwitchBase64(value: string): string {
  const buffer = (globalThis as { Buffer?: { from: (input: string, encoding: string) => unknown } })
    .Buffer;
  if (buffer?.from) {
    const bytes = buffer.from(value, "utf-8") as { toString: (encoding: string) => string };
    return bytes.toString("base64");
  }
  const TextEncoderCtor = (
    globalThis as { TextEncoder?: new () => { encode: (input: string) => Uint8Array } }
  ).TextEncoder;
  if (typeof btoa === "function" && TextEncoderCtor) {
    const utf8Bytes = new TextEncoderCtor().encode(value);
    let binary = "";
    for (const byte of utf8Bytes) {
      binary += String.fromCharCode(byte);
    }
    return btoa(binary);
  }
  throw new Error("Base64 encoder is unavailable");
}

/**
 * The JSON the link's `config` parameter carries, before Base64.
 *
 * - Claude Code: `{"env": {...}}`. CC Switch has no URL parameter for the Fable tier, so it
 *   travels as an env var; CC Switch merges `config.env` with the URL parameters (which win)
 *   and keeps custom env vars (v3.16+).
 * - Codex: `{"auth": {...}, "config": "<config.toml>"}`, the shape of a CC Switch row.
 */
export function buildCcSwitchLinkConfig(plan: CcSwitchImportPlan): Record<string, unknown> | null {
  if (plan.client.type === "claude") {
    const fable = plan.claudeTiers?.fable ?? "";
    return fable ? { env: { ANTHROPIC_DEFAULT_FABLE_MODEL: fable } } : null;
  }
  if (plan.codex) {
    return {
      ...(plan.apiKey ? { auth: { OPENAI_API_KEY: plan.apiKey } } : {}),
      config: plan.codex.configToml,
    };
  }
  return null;
}

export function buildCcSwitchImportParams(plan: CcSwitchImportPlan): URLSearchParams {
  const params = new URLSearchParams();
  const set = (key: string, value: string | number | boolean | null | undefined) => {
    if (value === null || value === undefined) return;
    const text = String(value).trim();
    if (text) params.set(key, text);
  };

  set("resource", "provider");
  set("app", plan.client.app);
  set("name", plan.name);
  set("endpoint", plan.endpoint);
  set("apiKey", plan.apiKey);
  // Required by CC Switch v3.7; later versions infer it from the endpoint when missing.
  set("homepage", plan.homepage);
  set("icon", plan.client.icon);
  set("notes", plan.notes);
  set("enabled", plan.enabled);
  set("model", plan.model);
  if (plan.claudeTiers) {
    // Only tiers the preset sets: a tier left out follows the main model in CC Switch.
    set("haikuModel", plan.claudeTiers.haiku);
    set("sonnetModel", plan.claudeTiers.sonnet);
    set("opusModel", plan.claudeTiers.opus);
  }
  const config = buildCcSwitchLinkConfig(plan);
  if (config) {
    set("config", encodeCcSwitchBase64(JSON.stringify(config)));
    set("configFormat", "json");
  }
  if (plan.usage) {
    // v4.0.10 enables a linked script by default; v3.19–v4.0.9 need usageEnabled=true.
    set("usageEnabled", true);
    set("usageScript", encodeCcSwitchBase64(plan.usage.script));
    set("usageBaseUrl", plan.usage.baseUrl);
    set("usageAutoInterval", plan.usage.autoInterval);
  }
  return params;
}

export function buildCcSwitchImportUrl(plan: CcSwitchImportPlan): string {
  return `ccswitch://v1/import?${buildCcSwitchImportParams(plan).toString()}`;
}

export function openCcSwitchImportUrl(
  url: string,
  options: { onProtocolUnavailable?: () => void } = {},
): void {
  try {
    window.open(url, "_self");
  } catch {
    options.onProtocolUnavailable?.();
  }
}
