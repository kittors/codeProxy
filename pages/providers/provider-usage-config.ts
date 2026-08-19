import type { ProviderSimpleConfig } from "@code-proxy/api-client";
import type { OpenCodeGoUsageCacheEntry } from "./components/OpenCodeGoUsageCardSection";
import type {
  DiscoveredProviderModel,
  ModelAccessProvider,
} from "./provider-model-access";
import type { ProviderTabId } from "./components/ProviderTabsWithCounts";

/**
 * Which channels report plan usage, how their windows are labelled, and what each
 * one needs before a usage query is worth sending.
 *
 * Split out of ProvidersPageContent so adding a channel does not grow a file that
 * is already frozen at its size baseline.
 */

export type ProviderUsageProvider =
  | "opencode-go"
  | "cline"
  | "ollama-cloud"
  | "commandcode";

export type OpenCodeGoUsageState = Record<string, OpenCodeGoUsageCacheEntry>;

export const PROVIDER_USAGE_WINDOWS: Record<
  ProviderUsageProvider,
  readonly string[]
> = {
  "opencode-go": ["rolling", "weekly", "monthly"],
  cline: ["five_hour", "weekly", "monthly"],
  "ollama-cloud": ["rolling", "weekly"],
  commandcode: ["five_hour", "weekly"],
};

const USAGE_CACHE_SCOPE: Record<ProviderUsageProvider, string> = {
  "opencode-go": "workspace",
  cline: "dashboard",
  "ollama-cloud": "dashboard",
  // Keyed by credential rather than by browser session: Command Code reports
  // usage from the API key itself, so there is no dashboard session to scope to.
  commandcode: "apikey",
};

export const hasOpenCodeGoUsageQuery = (item: ProviderSimpleConfig) =>
  Boolean(item.workspaceId?.trim() && item.authCookie?.trim());

export const getProviderUsageCacheKey = (
  provider: ProviderUsageProvider,
  item: ProviderSimpleConfig,
  index: number,
) =>
  [
    provider,
    provider === "opencode-go"
      ? item.workspaceId?.trim() || "no-workspace"
      : USAGE_CACHE_SCOPE[provider],
    item.name?.trim() || item.apiKey?.trim() || `item-${index}`,
    index,
  ].join(":");

export const migrateProviderUsageCache = (
  cached: OpenCodeGoUsageState,
): OpenCodeGoUsageState => {
  const next = { ...cached };
  Object.entries(cached).forEach(([key, entry]) => {
    if (
      key.startsWith("opencode-go:") ||
      key.startsWith("cline:") ||
      key.startsWith("ollama-cloud:") ||
      key.startsWith("commandcode:")
    ) {
      return;
    }
    next[`opencode-go:${key}`] ??= entry;
  });
  return next;
};

export const hasProviderUsageQuery = (
  provider: ProviderUsageProvider,
  item: ProviderSimpleConfig,
) => {
  if (provider === "opencode-go") return hasOpenCodeGoUsageQuery(item);
  // Command Code needs no dashboard cookie; the inference key also reads credits.
  if (provider === "commandcode") return Boolean(item.apiKey?.trim());
  return Boolean(item.authCookie?.trim());
};

export type ModelAccessCatalogState = Record<
  ModelAccessProvider,
  DiscoveredProviderModel[]
>;
export type ModelAccessCatalogLoadedState = Record<ModelAccessProvider, boolean>;

export const EMPTY_MODEL_ACCESS_CATALOGS: ModelAccessCatalogState = {
  "opencode-go": [],
  cline: [],
  "ollama-cloud": [],
  commandcode: [],
};

export const EMPTY_MODEL_ACCESS_CATALOG_LOADED: ModelAccessCatalogLoadedState = {
  "opencode-go": false,
  cline: false,
  "ollama-cloud": false,
  commandcode: false,
};

export const isModelAccessProvider = (
  tabId: ProviderTabId,
): tabId is ModelAccessProvider =>
  tabId === "opencode-go" ||
  tabId === "cline" ||
  tabId === "ollama-cloud" ||
  tabId === "commandcode";

/** Provider list slots that seed from tenant-scoped localStorage. */
export const PROVIDER_LIST_CACHE_SLOTS: Record<
  Exclude<ProviderTabId, "ampcode">,
  string
> = {
  gemini: "gemini",
  claude: "claude",
  codex: "codex",
  "opencode-go": "opencode-go",
  cline: "cline",
  "ollama-cloud": "ollama-cloud",
  commandcode: "commandcode",
  vertex: "vertex",
  bedrock: "bedrock",
  openai: "openai",
};
