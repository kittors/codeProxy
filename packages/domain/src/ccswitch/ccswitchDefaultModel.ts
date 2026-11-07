import type { CcSwitchClientType } from "./ccswitchClients";

/**
 * The first choice for a new preset's main / default model when its channel group serves
 * several, carried over from the earlier editor. Priorities are tried in order; the first
 * model id containing one (case-insensitive), in the group's order, wins.
 *
 * - Claude Code's main model: Sonnet, then Opus, then Haiku, then any Claude model, and
 *   otherwise the first model — the earlier editor's main-role rule.
 * - Codex and Gemini CLI: the earlier editor's MODEL_PRIORITY lists; no match, no pick.
 * - OpenCode, OpenClaw and Hermes never had a rule, so nothing is picked for them.
 */
const DEFAULT_MODEL_PRIORITY: Partial<Record<CcSwitchClientType, readonly string[]>> = {
  claude: ["sonnet", "opus", "haiku", "claude"],
  codex: [
    "gpt-5.5",
    "gpt-5.3-codex",
    "gpt-5-codex",
    "codex",
    "gpt-5",
    "gpt-4.1",
    "gpt-4",
    "o4",
    "o3",
  ],
  gemini: ["gemini-3", "gemini-2.5-pro", "gemini-2.5-flash", "gemini"],
};

export function pickCcSwitchDefaultModel(
  clientType: CcSwitchClientType,
  models: readonly string[],
): string | undefined {
  const candidates = models.map((model) => String(model ?? "").trim()).filter(Boolean);
  if (candidates.length === 0) return undefined;
  for (const priority of DEFAULT_MODEL_PRIORITY[clientType] ?? []) {
    const match = candidates.find((model) => model.toLowerCase().includes(priority));
    if (match) return match;
  }
  return clientType === "claude" ? candidates[0] : undefined;
}
