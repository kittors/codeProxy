import { apiClient } from "../client/client";
import type {
  CredentialImportKind,
  CredentialImportResponse,
  IFlowCookieAuthResponse,
  OAuthAuthStatusResponse,
  OAuthCallbackResponse,
  OAuthProvider,
  OAuthStartResponse,
} from "../dto/types";

export interface CredentialImportInput {
  credential: string;
  proxyId?: string;
  /** Grok only: api.x.ai credit instead of the Grok Build plan. */
  usingApi?: boolean;
}

const WEBUI_SUPPORTED: OAuthProvider[] = [
  "codex",
  "anthropic",
  "antigravity",
  "xai",
  "gemini-cli",
  "iflow",
];
const CALLBACK_PROVIDER_MAP: Partial<Record<OAuthProvider, string>> = {
  "gemini-cli": "gemini",
};

export interface OAuthProxyOptions {
  projectId?: string;
  proxyId?: string;
  usingApi?: boolean;
  /**
   * Claude only: "code" redirects to Anthropic's code page instead of a
   * localhost forwarder, so a remote panel never sends the browser to a page it
   * cannot open. Older servers ignore it and the issued URL says which one ran.
   */
  callbackMode?: "code";
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
    if (provider === "anthropic" && options?.callbackMode === "code") {
      params.callback_mode = "code";
    }
    if (proxyId) {
      params.proxy_id = proxyId;
    }
    return apiClient.get<OAuthStartResponse>(`/${provider}-auth-url`, {
      params,
    });
  },
  getAuthStatus: (state: string) =>
    apiClient.get<OAuthAuthStatusResponse>(
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
  /**
   * Adds an account from a credential the operator already holds (a claude.ai
   * session cookie, an OpenAI / Google refresh token, a Grok web SSO cookie).
   * Resolves with the saved account on success; a failure throws an ApiError
   * whose status/code the panel maps to a message (404 means the backend is too
   * old to offer this import).
   */
  importCredential: (kind: CredentialImportKind, input: CredentialImportInput) => {
    const proxyId = normalizeString(input.proxyId);
    return apiClient.post<CredentialImportResponse>(`/oauth-import/${kind}`, {
      credential: input.credential,
      ...(proxyId ? { proxy_id: proxyId } : {}),
      ...(input.usingApi ? { using_api: true } : {}),
    });
  },
};
