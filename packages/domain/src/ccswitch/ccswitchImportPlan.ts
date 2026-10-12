import {
  getCcSwitchClientConfig,
  type CcSwitchClaudeModelRole,
  type CcSwitchClientConfig,
  type CcSwitchClientType,
} from "./ccswitchClients";
import {
  buildCcSwitchCodexConfigToml,
  resolveCcSwitchCodexReasoningEffort,
} from "./ccswitchCodexConfig";
import {
  defaultCcSwitchProviderName,
  normalizeCcSwitchRoutePath,
  type CcSwitchImportConfigListItem,
  type CcSwitchModelMapping,
} from "./ccswitchImportConfigList";
import { buildCcSwitchUsageScript, canCcSwitchQueryUsage } from "./ccswitchUsageScript";

/**
 * Everything one import needs, worked out once. The deep link and the "what CC Switch will
 * write" preview are both rendered from this, so the preview cannot drift from the link.
 */
export interface CcSwitchImportPlanInput {
  apiKey: string;
  /** API root, e.g. `https://relay.example.com`; a trailing `/v0/management` is dropped. */
  baseUrl: string;
  config: CcSwitchImportConfigListItem;
  /**
   * The route path to put in the endpoint. Defaults to the preset's own; presets saved
   * before presets had route paths pass the channel group's path route instead.
   */
  routePath?: string;
  /** Root the usage query runs against; defaults to `baseUrl`. */
  usageBaseUrl?: string;
  usageLanguage?: string;
  /** Name to use when the preset has none. */
  providerName?: string;
}

/**
 * Why the provider name in the link differs from the preset's:
 * - `gemini-official-auth`: CC Switch treats a Gemini provider named "google" or
 *   "google …" as Google's official OAuth login and drops the API key.
 * - `dynamic-reference`: OpenCode / OpenClaw / Hermes expand `${…}`, `{env:…}` and
 *   `{file:…}` in their config, so CC Switch refuses links that contain them.
 */
export type CcSwitchNameAdjustment = "gemini-official-auth" | "dynamic-reference";

export type CcSwitchClaudeTiers = Record<Exclude<CcSwitchClaudeModelRole, "main">, string>;

export interface CcSwitchImportPlan {
  client: CcSwitchClientConfig;
  name: string;
  nameAdjustment: CcSwitchNameAdjustment | null;
  homepage: string;
  endpoint: string;
  apiKey: string;
  notes: string;
  /**
   * Initial value of CC Switch's "switch to it after import" toggle for apps that switch a
   * single provider. Additive apps leave it out: CC Switch adds them by default.
   */
  enabled: boolean | null;
  /** Request name of the main / default model; "" leaves `model` out of the link. */
  model: string;
  /** Claude Code tiers by request name; "" means the tier follows the main model. */
  claudeTiers: CcSwitchClaudeTiers | null;
  codex: { reasoningEffort: string; contextWindow: number | null; configToml: string } | null;
  /** Null when CC Switch could not run the usage query (plain HTTP, not loopback). */
  usage: { script: string; baseUrl: string; autoInterval: number } | null;
}

export function normalizeCcSwitchBaseUrl(input: string): string {
  let base = input.trim();
  if (!base) return "";

  base = base.replace(/\/?v0\/management\/?$/i, "");
  base = base.replace(/\/+$/, "");

  if (!/^https?:\/\//i.test(base)) {
    base = `http://${base}`;
  }

  return base.replace(/\/+$/, "");
}

const GEMINI_SAFE_NAME_PREFIX = "CliProxy ";

/** CC Switch's own test (`gemini_auth::detect_gemini_auth_type`), on the trimmed name. */
export function isCcSwitchGeminiOfficialName(name: string): boolean {
  const lower = name.trim().toLowerCase();
  return lower === "google" || lower.startsWith("google ");
}

const DYNAMIC_REFERENCE_PATTERN = /\$\{|\{(?:env|file):/;

export function hasCcSwitchDynamicReference(value: string): boolean {
  return DYNAMIC_REFERENCE_PATTERN.test(value);
}

/** Removes the openers OpenCode / OpenClaw / Hermes would expand, keeping the rest. */
const stripDynamicReferences = (value: string): string =>
  value.replace(/\$\{/g, "$").replace(/\{(env|file):/g, "$1:");

export function resolveCcSwitchProviderName(
  rawName: string,
  clientType: CcSwitchClientType,
): { name: string; adjustment: CcSwitchNameAdjustment | null } {
  const fallback = defaultCcSwitchProviderName(clientType);
  let name = rawName.trim() || fallback;
  if (getCcSwitchClientConfig(clientType).additive && hasCcSwitchDynamicReference(name)) {
    name = stripDynamicReferences(name).trim() || fallback;
    return { name, adjustment: "dynamic-reference" };
  }
  if (clientType === "gemini" && isCcSwitchGeminiOfficialName(name)) {
    return { name: `${GEMINI_SAFE_NAME_PREFIX}${name}`, adjustment: "gemini-official-auth" };
  }
  return { name, adjustment: null };
}

const sameModel = (left: string, right: string) =>
  left.trim().toLowerCase() === right.trim().toLowerCase();

const roleRequestModel = (
  mappings: readonly CcSwitchModelMapping[],
  role: CcSwitchClaudeModelRole,
): string => mappings.find((mapping) => mapping.role === role)?.requestModel.trim() ?? "";

/** The model name the link sends: what the desktop app will put in its requests. */
export function resolveCcSwitchLinkModel(config: CcSwitchImportConfigListItem): string {
  if (config.clientType === "claude") {
    // Earlier panels stored the main model's *target* as default-model; the main mapping's
    // request name is what the route rewrites, so it wins when there is one.
    return roleRequestModel(config.modelMappings, "main") || config.defaultModel.trim();
  }
  return (
    config.defaultModel.trim() ||
    config.modelMappings.find((mapping) => !mapping.role)?.requestModel.trim() ||
    ""
  );
}

export function resolveCcSwitchImportPlan(input: CcSwitchImportPlanInput): CcSwitchImportPlan {
  const { config } = input;
  const client = getCcSwitchClientConfig(config.clientType);
  const { name, adjustment } = resolveCcSwitchProviderName(
    config.providerName || input.providerName || "",
    config.clientType,
  );
  const homepage = normalizeCcSwitchBaseUrl(input.baseUrl);
  const routePath = normalizeCcSwitchRoutePath(input.routePath ?? config.routePath);
  const endpoint = `${homepage}${routePath}${client.endpointSuffix}`;
  const model = resolveCcSwitchLinkModel(config);

  const claudeTiers: CcSwitchClaudeTiers | null =
    config.clientType === "claude"
      ? {
          haiku: roleRequestModel(config.modelMappings, "haiku"),
          sonnet: roleRequestModel(config.modelMappings, "sonnet"),
          opus: roleRequestModel(config.modelMappings, "opus"),
          fable: roleRequestModel(config.modelMappings, "fable"),
        }
      : null;

  let codex: CcSwitchImportPlan["codex"] = null;
  if (config.clientType === "codex") {
    const defaultMapping = model
      ? config.modelMappings.find(
          (mapping) => !mapping.role && sameModel(mapping.requestModel, model),
        )
      : undefined;
    const contextWindow = defaultMapping?.contextWindow ?? null;
    const reasoningEffort = resolveCcSwitchCodexReasoningEffort(
      model,
      config.codexReasoningEfforts,
    );
    codex = {
      reasoningEffort,
      contextWindow,
      configToml: buildCcSwitchCodexConfigToml({
        model,
        reasoningEffort,
        contextWindow,
        providerName: name,
        endpoint,
      }),
    };
  }

  const usageBaseUrl = normalizeCcSwitchBaseUrl(input.usageBaseUrl || input.baseUrl);
  const usage = canCcSwitchQueryUsage(usageBaseUrl)
    ? {
        script: buildCcSwitchUsageScript(input.usageLanguage),
        baseUrl: usageBaseUrl,
        autoInterval: config.usageAutoInterval,
      }
    : null;

  return {
    client,
    name,
    nameAdjustment: adjustment,
    homepage,
    endpoint,
    apiKey: input.apiKey.trim(),
    notes: config.note.trim(),
    enabled: client.additive ? null : true,
    model,
    claudeTiers,
    codex,
    usage,
  };
}
