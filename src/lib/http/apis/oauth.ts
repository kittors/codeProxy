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

export const oauthApi = {
  startAuth: (provider: OAuthProvider, options?: { projectId?: string }) => {
    const params: Record<string, string | boolean> = {};
    if (WEBUI_SUPPORTED.includes(provider)) {
      params.is_webui = true;
    }
    if (provider === "gemini-cli" && options?.projectId) {
      params.project_id = options.projectId;
    }
    return apiClient.get<OAuthStartResponse>(`/${provider}-auth-url`, { params });
  },
  getAuthStatus: (state: string) =>
    apiClient.get<{ status: "ok" | "wait" | "error"; error?: string }>("/get-auth-status", {
      params: { state },
    }),
  submitCallback: (provider: OAuthProvider, redirectUrl: string) => {
    const callbackProvider = CALLBACK_PROVIDER_MAP[provider] ?? provider;
    return apiClient.post<OAuthCallbackResponse>("/oauth-callback", {
      provider: callbackProvider,
      redirect_url: redirectUrl,
    });
  },
  iflowCookieAuth: (cookie: string) =>
    apiClient.post<IFlowCookieAuthResponse>("/iflow-auth-url", { cookie }),
};
