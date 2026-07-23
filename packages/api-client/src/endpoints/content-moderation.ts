import { apiClient } from "../client/client";

export type ContentModerationMode = "off" | "pre_block";
export type ContentModerationKeywordMode = "api_only" | "keyword_only" | "keyword_and_api";
export type ContentModerationChannelType = "auth_file" | "provider_key" | "provider";
export type ContentModerationTagMode = "any" | "all";
export type ContentModerationDecisionAction = "allow" | "keyword_block" | "api_block" | "api_error";

export interface ContentModerationProfileView {
  id: string;
  name: string;
  mode: ContentModerationMode;
  base_url: string;
  model: string;
  timeout_ms: number;
  keyword_mode: ContentModerationKeywordMode;
  blocked_keywords: string[];
  thresholds: Record<string, number>;
  block_http_status: number;
  block_message: string;
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
  base_url: string;
  model: string;
  api_key?: string;
  timeout_ms: number;
  keyword_mode: ContentModerationKeywordMode;
  blocked_keywords: string[];
  thresholds: Record<string, number>;
  block_http_status: number;
  block_message: string;
}

export interface PatchContentModerationProfileInput {
  version: number;
  name?: string;
  mode?: ContentModerationMode;
  base_url?: string;
  model?: string;
  api_key?: string;
  clear_api_key?: boolean;
  timeout_ms?: number;
  keyword_mode?: ContentModerationKeywordMode;
  blocked_keywords?: string[];
  thresholds?: Record<string, number>;
  block_http_status?: number;
  block_message?: string;
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
  latency_ms: number;
  moderation_error?: string;
}

export const contentModerationApi = {
  async listProfiles(): Promise<ContentModerationProfileView[]> {
    const response = await apiClient.get<{ items?: ContentModerationProfileView[] }>(
      "/content-moderation/profiles",
    );
    return Array.isArray(response.items) ? response.items : [];
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
};
