import { apiClient } from "../client/client";
import type {
  IFlowCookieAuthResponse,
  OAuthCallbackResponse,
  OAuthProvider,
  OAuthStartResponse,
} from "../dto/types";

const WEBUI_SUPPORTED: OAuthProvider[] = [
  "codex",
  "anthropic",
  "antigravity",
  "xai",
  "gemini-cli",
];
const CALLBACK_PROVIDER_MAP: Partial<Record<OAuthProvider, string>> = {
  "gemini-cli": "gemini",
};

export interface OAuthProxyOptions {
  projectId?: string;
  proxyId?: string;
  usingApi?: boolean;
}

export type OAuthCallbackSubmission =
  | string
  | {
      redirectUrl?: string;
      code?: string;
      state?: string;
      error?: string;
    };

const normalizeString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

export const oauthApi = {
  startAuth: (provider: OAuthProvider, options?: OAuthProxyOptions) => {
    const params: Record<string, string | boolean> = {};
    if (WEBUI_SUPPORTED.includes(provider)) {
      params.is_webui = true;
    }
    const projectId = normalizeString(options?.projectId);
    const proxyId = normalizeString(options?.proxyId);
    if (provider === "gemini-cli" && projectId) {
      params.project_id = projectId;
    }
    if (provider === "xai") {
      params.using_api = options?.usingApi === true;
    }
    if (proxyId) {
      params.proxy_id = proxyId;
    }
    return apiClient.get<OAuthStartResponse>(`/${provider}-auth-url`, {
      params,
    });
  },
  getAuthStatus: (state: string) =>
    apiClient.get<{ status: "ok" | "wait" | "error"; error?: string }>(
      "/get-auth-status",
      {
        params: { state },
      },
    ),
  submitCallback: (
    provider: OAuthProvider,
    callback: OAuthCallbackSubmission,
    options?: { proxyId?: string },
  ) => {
    const callbackProvider = CALLBACK_PROVIDER_MAP[provider] ?? provider;
    const proxyId = normalizeString(options?.proxyId);
    const redirectUrl =
      typeof callback === "string"
        ? callback.trim()
        : normalizeString(callback.redirectUrl);
    const code =
      typeof callback === "string" ? "" : normalizeString(callback.code);
    const state =
      typeof callback === "string" ? "" : normalizeString(callback.state);
    const error =
      typeof callback === "string" ? "" : normalizeString(callback.error);
    return apiClient.post<OAuthCallbackResponse>("/oauth-callback", {
      provider: callbackProvider,
      ...(redirectUrl ? { redirect_url: redirectUrl } : {}),
      ...(code ? { code } : {}),
      ...(state ? { state } : {}),
      ...(error ? { error } : {}),
      ...(proxyId ? { proxy_id: proxyId } : {}),
    });
  },
  iflowCookieAuth: (cookie: string, options?: { proxyId?: string }) => {
    const proxyId = normalizeString(options?.proxyId);
    return apiClient.post<IFlowCookieAuthResponse>("/iflow-auth-url", {
      cookie,
      ...(proxyId ? { proxy_id: proxyId } : {}),
    });
  },
};
