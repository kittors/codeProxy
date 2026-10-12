/**
 * The CC Switch desktop apps a preset can target.
 *
 * CC Switch v4.0.10 accepts `app` = claude, codex, gemini, grokbuild, opencode, openclaw,
 * hermes or pi on a provider deep link. The backend routes the first three plus the three
 * "additive" apps (OpenCode, OpenClaw, Hermes), which keep several providers side by side
 * instead of switching one active provider.
 */
export type CcSwitchClientType = "claude" | "codex" | "gemini" | "opencode" | "openclaw" | "hermes";

export type CcSwitchClaudeModelRole = "main" | "haiku" | "sonnet" | "opus" | "fable";

export const CC_SWITCH_CLAUDE_ROLES: readonly CcSwitchClaudeModelRole[] = [
  "main",
  "haiku",
  "sonnet",
  "opus",
  "fable",
];

/** Claude Code's model tiers besides the main model; an empty tier follows the main model. */
export const CC_SWITCH_CLAUDE_TIER_ROLES: readonly Exclude<CcSwitchClaudeModelRole, "main">[] = [
  "haiku",
  "sonnet",
  "opus",
  "fable",
];

export interface CcSwitchClientConfig {
  type: CcSwitchClientType;
  /** The deep link's `app` value. */
  app: CcSwitchClientType;
  /**
   * A CC Switch built-in icon name. `codex` is not one of them — CC Switch shows the OpenAI
   * mark for Codex, so the link asks for `openai`.
   */
  icon: string;
  labelKey: string;
  fallbackLabel: string;
  /**
   * Appended after the preset's route path. Codex joins `/responses` and the additive apps
   * join `/chat/completions` onto the endpoint, so theirs ends in `/v1`; Claude Code and
   * Gemini CLI add their own `/v1/messages` / `/v1beta/...` and take the bare route.
   */
  endpointSuffix: "" | "/v1";
  /** OpenCode / OpenClaw / Hermes: no "switch to this provider" step, so no `enabled`. */
  additive: boolean;
}

export const CC_SWITCH_CLIENTS: readonly CcSwitchClientConfig[] = [
  {
    type: "claude",
    app: "claude",
    icon: "claude",
    labelKey: "ccswitch.client_claude_code",
    fallbackLabel: "Claude Code",
    endpointSuffix: "",
    additive: false,
  },
  {
    type: "codex",
    app: "codex",
    icon: "openai",
    labelKey: "ccswitch.client_codex",
    fallbackLabel: "Codex",
    endpointSuffix: "/v1",
    additive: false,
  },
  {
    type: "gemini",
    app: "gemini",
    icon: "gemini",
    labelKey: "ccswitch.client_gemini_cli",
    fallbackLabel: "Gemini CLI",
    endpointSuffix: "",
    additive: false,
  },
  {
    type: "opencode",
    app: "opencode",
    icon: "opencode",
    labelKey: "ccswitch.client_opencode",
    fallbackLabel: "OpenCode",
    endpointSuffix: "/v1",
    additive: true,
  },
  {
    type: "openclaw",
    app: "openclaw",
    icon: "openclaw",
    labelKey: "ccswitch.client_openclaw",
    fallbackLabel: "OpenClaw",
    endpointSuffix: "/v1",
    additive: true,
  },
  {
    type: "hermes",
    app: "hermes",
    icon: "hermes",
    labelKey: "ccswitch.client_hermes",
    fallbackLabel: "Hermes",
    endpointSuffix: "/v1",
    additive: true,
  },
];

/** Display order; mirrors the backend's `usage.CcSwitchClientTypes`. */
export const CC_SWITCH_CLIENT_TYPES: readonly CcSwitchClientType[] = CC_SWITCH_CLIENTS.map(
  (client) => client.type,
);

/**
 * What a backend accepts when its GET /ccswitch-import-configs has no `client-types`
 * field: those backends predate the additive apps and reject them on save.
 */
export const LEGACY_CC_SWITCH_CLIENT_TYPES: readonly CcSwitchClientType[] = [
  "claude",
  "codex",
  "gemini",
];

const CLIENT_BY_TYPE = new Map(CC_SWITCH_CLIENTS.map((client) => [client.type, client]));

export function isCcSwitchClientType(value: unknown): value is CcSwitchClientType {
  return typeof value === "string" && CLIENT_BY_TYPE.has(value as CcSwitchClientType);
}

export function getCcSwitchClientConfig(type: CcSwitchClientType): CcSwitchClientConfig {
  return CLIENT_BY_TYPE.get(type) ?? CC_SWITCH_CLIENTS[0]!;
}

/**
 * Reads the backend's `client-types` capability. Returns null when the field is missing
 * (an older backend), so callers fall back to {@link LEGACY_CC_SWITCH_CLIENT_TYPES}.
 * Values this panel does not know are dropped; the result keeps the panel's order.
 */
export function parseCcSwitchClientTypes(value: unknown): CcSwitchClientType[] | null {
  if (!Array.isArray(value)) return null;
  const offered = new Set(
    value.map((item) =>
      String(item ?? "")
        .trim()
        .toLowerCase(),
    ),
  );
  return CC_SWITCH_CLIENT_TYPES.filter((type) => offered.has(type));
}
