import { apiClient } from "@/lib/http/client";
import type {
  IFlowCookieAuthResponse,
  OAuthCallbackResponse,
  OAuthProvider,
  OAuthStartResponse,
} from "@/lib/http/types";

const WEBUI_SUPPORTED: OAuthProvider[] = ["codex", "anthropic", "antigravity", "gemini-cli"];
const CALLBACK_PROVIDER_MAP: Partial<Record<OAuthProvider, string>> = {
  "gemini-cli": "gemini",
};

export interface OAuthProxyOptions {
  projectId?: string;
  proxyId?: string;
}

const normalizeString = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

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
    if (proxyId) {
      params.proxy_id = proxyId;
    }
    return apiClient.get<OAuthStartResponse>(`/${provider}-auth-url`, { params });
  },
  getAuthStatus: (state: string) =>
    apiClient.get<{ status: "ok" | "wait" | "error"; error?: string }>("/get-auth-status", {
      params: { state },
    }),
  submitCallback: (
    provider: OAuthProvider,
    redirectUrl: string,
    options?: { proxyId?: string },
  ) => {
    const callbackProvider = CALLBACK_PROVIDER_MAP[provider] ?? provider;
    const proxyId = normalizeString(options?.proxyId);
    return apiClient.post<OAuthCallbackResponse>("/oauth-callback", {
      provider: callbackProvider,
      redirect_url: redirectUrl,
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
