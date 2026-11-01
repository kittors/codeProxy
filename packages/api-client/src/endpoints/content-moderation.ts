import { apiClient } from "../client/client";
import { isRecord } from "../client/response";

export type ContentModerationMode = "off" | "pre_block";
export type ContentModerationKeywordMode = "api_only" | "keyword_only" | "keyword_and_api";
export type ContentModerationChannelType = "auth_file" | "provider_key" | "provider";
export type ContentModerationTagMode = "any" | "all";
export type ContentModerationDecisionAction =
  | "allow"
  | "keyword_block"
  | "api_block"
  | "guard_block"
  | "api_error";
export type ContentModerationBackend = "openai_moderations" | "qwen3guard";
export type ContentModerationControversialAction = "allow" | "block" | "elevated_only";
export type ContentModerationSafety = "Safe" | "Controversial" | "Unsafe";

/** Qwen3Guard risk categories, in the model card's order. */
export const CONTENT_MODERATION_SCANNERS = [
  "violent",
  "non_violent_illegal_acts",
  "sexual_content_or_sexual_acts",
  "pii",
  "suicide_and_self_harm",
  "unethical_acts",
  "politically_sensitive_topics",
  "copyright_violation",
  "jailbreak",
] as const;

export type ContentModerationScanner = (typeof CONTENT_MODERATION_SCANNERS)[number];

export interface ContentModerationProfileView {
  id: string;
  name: string;
  mode: ContentModerationMode;
  backend: ContentModerationBackend;
  base_url: string;
  model: string;
  timeout_ms: number;
  keyword_mode: ContentModerationKeywordMode;
  blocked_keywords: string[];
  thresholds: Record<string, number>;
  scanners: ContentModerationScanner[];
  controversial_action: ContentModerationControversialAction;
  elevated_categories: ContentModerationScanner[];
  input_limit: number;
  max_chunks: number;
  block_http_status: number;
  block_message: string;
  /**
   * Keyword matching folds Traditional Chinese into Simplified. Older backends
   * do not return it (see ContentModerationProfileCapabilities).
   */
  keyword_fold_traditional_chinese?: boolean;
  /** Tool output is sent to the moderation service too. Older backends do not return it. */
  api_includes_tool_output?: boolean;
  version: number;
  created_at: string;
  updated_at: string;
  api_key_configured: boolean;
  api_key_masked?: string;
  binding_counts: Partial<Record<ContentModerationChannelType, number>>;
}

export interface CreateContentModerationProfileInput {
  name: string;
  mode: ContentModerationMode;
  backend: ContentModerationBackend;
  base_url: string;
  model: string;
  api_key?: string;
  timeout_ms: number;
  keyword_mode: ContentModerationKeywordMode;
  blocked_keywords: string[];
  thresholds: Record<string, number>;
  scanners: ContentModerationScanner[];
  controversial_action: ContentModerationControversialAction;
  elevated_categories: ContentModerationScanner[];
  input_limit: number;
  max_chunks: number;
  block_http_status: number;
  block_message: string;
  /** Sent only when the backend declares them; omitted, the backend stores them off. */
  keyword_fold_traditional_chinese?: boolean;
  api_includes_tool_output?: boolean;
}

export interface PatchContentModerationProfileInput {
  version: number;
  name?: string;
  mode?: ContentModerationMode;
  backend?: ContentModerationBackend;
  base_url?: string;
  model?: string;
  api_key?: string;
  clear_api_key?: boolean;
  timeout_ms?: number;
  keyword_mode?: ContentModerationKeywordMode;
  blocked_keywords?: string[];
  thresholds?: Record<string, number>;
  scanners?: ContentModerationScanner[];
  controversial_action?: ContentModerationControversialAction;
  elevated_categories?: ContentModerationScanner[];
  input_limit?: number;
  max_chunks?: number;
  block_http_status?: number;
  block_message?: string;
  /** Omitted means unchanged, so saving from a panel that lacks them keeps them as they are. */
  keyword_fold_traditional_chinese?: boolean;
  api_includes_tool_output?: boolean;
}

/**
 * Profile fields added after the first release that the backend declares, in the
 * profile list, that it stores. The panel updates itself from the latest release
 * and may talk to an older backend, which silently drops fields it does not know
 * (gin ignores unknown JSON keys), so a field is shown and sent only when declared.
 */
export interface ContentModerationProfileCapabilities {
  /** keyword_fold_traditional_chinese */
  keywordFoldTraditionalChinese: boolean;
  /** api_includes_tool_output */
  apiIncludesToolOutput: boolean;
  /**
   * word_guard: the sensitive-word policy endpoints (content-moderation-words.ts) exist. An older
   * backend does not list it, and has no such routes to call.
   */
  wordGuard: boolean;
  /**
   * secret_masking: the outbound secret masking switch (getSecretMasking / setSecretMasking)
   * exists. An older backend does not list it, and has no such route to call.
   */
  secretMasking: boolean;
}

export const NO_CONTENT_MODERATION_PROFILE_CAPABILITIES: ContentModerationProfileCapabilities = {
  keywordFoldTraditionalChinese: false,
  apiIncludesToolOutput: false,
  wordGuard: false,
  secretMasking: false,
};

/** Reads the declaration from a profile list response; anything not declared is unsupported. */
export const readContentModerationProfileCapabilities = (
  payload: unknown,
): ContentModerationProfileCapabilities => {
  const capabilities =
    isRecord(payload) && isRecord(payload.capabilities) ? payload.capabilities : {};
  return {
    keywordFoldTraditionalChinese: capabilities.keyword_fold_traditional_chinese === true,
    apiIncludesToolOutput: capabilities.api_includes_tool_output === true,
    wordGuard: capabilities.word_guard === true,
    secretMasking: capabilities.secret_masking === true,
  };
};

/**
 * A tenant's outbound secret masking: API keys, tokens and passwords in requests are replaced
 * with placeholders before they reach the upstream, and put back in the reply. The backend keeps
 * the tenant's placeholder key to itself.
 */
export interface SecretMaskingState {
  enabled: boolean;
  /** False when the backend has no settings store: the switch can be read but not saved. */
  persistent: boolean;
  updated_at?: string;
}

export interface ContentModerationProfileList {
  items: ContentModerationProfileView[];
  capabilities: ContentModerationProfileCapabilities;
}

export interface ContentModerationChannelView {
  channel_type: ContentModerationChannelType;
  channel_id: string;
  name: string;
  provider: string;
  tags: string[];
  disabled: boolean;
  profile_id?: string;
}

export interface ContentModerationChannelPage {
  items: ContentModerationChannelView[];
  page: number;
  page_size: number;
  total: number;
}

type ContentModerationChannelPageResponse = Omit<ContentModerationChannelPage, "items"> & {
  items?: (Omit<ContentModerationChannelView, "tags"> & { tags?: string[] | null })[] | null;
};

export interface ContentModerationChannelQuery {
  channel_type?: ContentModerationChannelType;
  query?: string;
  tags?: string[];
  tag_mode?: ContentModerationTagMode;
  provider?: string;
  profile_id?: string;
  page?: number;
  page_size?: number;
  signal?: AbortSignal;
}

export interface ContentModerationBindingOperation {
  channel_type: ContentModerationChannelType;
  channel_id: string;
  profile_id: string | null;
}

export interface PatchContentModerationBindingsInput {
  allow_rebind: boolean;
  operations: ContentModerationBindingOperation[];
}

export interface ContentModerationBindingView {
  channel_type: ContentModerationChannelType;
  channel_id: string;
  profile_id: string;
  created_at: string;
  updated_at: string;
}

export interface ContentModerationDecision {
  would_block: boolean;
  action: ContentModerationDecisionAction;
  matched_keyword?: string;
  highest_category?: string;
  highest_score?: number;
  category_scores: Record<string, number>;
  thresholds: Record<string, number>;
  /** Guard backends classify into labels rather than scores. */
  safety?: ContentModerationSafety;
  categories?: string[];
  matched_scanners?: string[];
  latency_ms: number;
  moderation_error?: string;
}

export interface ContentModerationMetrics {
  requests: number;
  allows: number;
  blocks: number;
  errors: number;
  cache_hits: number;
  in_flight: number;
  latency_total_ms: number;
  latency_samples: number;
  avg_latency_ms: number;
}

export const contentModerationApi = {
  getMetrics() {
    return apiClient.get<ContentModerationMetrics>("/content-moderation/metrics");
  },

  async listProfiles(): Promise<ContentModerationProfileList> {
    const response = await apiClient.get<{
      items?: ContentModerationProfileView[];
      capabilities?: unknown;
    }>("/content-moderation/profiles");
    return {
      items: Array.isArray(response.items) ? response.items : [],
      capabilities: readContentModerationProfileCapabilities(response),
    };
  },

  createProfile(input: CreateContentModerationProfileInput) {
    return apiClient.post<ContentModerationProfileView>("/content-moderation/profiles", input);
  },

  getProfile(id: string) {
    return apiClient.get<ContentModerationProfileView>(
      `/content-moderation/profiles/${encodeURIComponent(id)}`,
    );
  },

  patchProfile(id: string, input: PatchContentModerationProfileInput) {
    return apiClient.patch<ContentModerationProfileView>(
      `/content-moderation/profiles/${encodeURIComponent(id)}`,
      input,
    );
  },

  deleteProfile(id: string) {
    return apiClient.delete(`/content-moderation/profiles/${encodeURIComponent(id)}`);
  },

  testProfile(id: string, input: string) {
    return apiClient.post<ContentModerationDecision>(
      `/content-moderation/profiles/${encodeURIComponent(id)}/test`,
      { input },
    );
  },

  async listChannels(
    query: ContentModerationChannelQuery = {},
  ): Promise<ContentModerationChannelPage> {
    const tags = query.tags
      ?.map((tag) => tag.trim())
      .filter(Boolean)
      .join(",");
    const response = await apiClient.get<ContentModerationChannelPageResponse>(
      "/content-moderation/channels",
      {
        params: {
          channel_type: query.channel_type,
          query: query.query?.trim() || undefined,
          tags: tags || undefined,
          tag_mode: query.tag_mode,
          provider: query.provider?.trim() || undefined,
          profile_id: query.profile_id?.trim() || undefined,
          page: query.page ?? 1,
          page_size: query.page_size ?? 20,
        },
        ...(query.signal ? { signal: query.signal } : {}),
      },
    );
    return {
      ...response,
      items: Array.isArray(response.items)
        ? response.items.map((channel) => ({
            ...channel,
            tags: Array.isArray(channel.tags) ? channel.tags : [],
          }))
        : [],
    };
  },

  patchBindings(input: PatchContentModerationBindingsInput) {
    return apiClient.patch<{ bindings: ContentModerationBindingView[] }>(
      "/content-moderation/channel-bindings",
      input,
    );
  },

  /** Only when the profile list declares capabilities.secretMasking. */
  getSecretMasking() {
    return apiClient.get<SecretMaskingState>("/content-moderation/secret-masking");
  },

  setSecretMasking(enabled: boolean) {
    return apiClient.put<SecretMaskingState>("/content-moderation/secret-masking", { enabled });
  },
};
