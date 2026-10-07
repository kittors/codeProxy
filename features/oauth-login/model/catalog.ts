import type { OAuthProvider } from "@code-proxy/api-client";

export type AccountProviderId =
  | "codex"
  | "anthropic"
  | "gemini-cli"
  | "antigravity"
  | "xai"
  | "iflow"
  | "qwen"
  | "kimi"
  | "vertex"
  | "auth-file";

export type AccountGroup = "browser" | "device" | "import";

/**
 * How an account gets in. `oauth` is the browser or device login the server
 * drives; the others hand over a credential the operator already has.
 * `session` / `refresh-token` / `sso-cookie` are the credential imports that
 * exchange a held credential for the same tokens a browser login would mint.
 */
export type AccountMethod =
  | "oauth"
  | "cookie"
  | "service-account"
  | "auth-file"
  | "session"
  | "refresh-token"
  | "sso-cookie";

export interface AccountProvider {
  id: AccountProviderId;
  group: AccountGroup;
  /** Key for VendorIcon; empty for entries drawn with a generic icon. */
  icon: string;
  /** i18n segment under add_account.providers. */
  copyKey: string;
  /** First entry is the default. */
  methods: AccountMethod[];
  oauth?: OAuthProvider;
  /** Gemini CLI: optional Google Cloud project. */
  projectId?: boolean;
  /** Grok: Build/CLI (subscription) or API (API credit) endpoint. */
  endpointMode?: boolean;
  /**
   * The server's default callback address, drawn in the illustration before a
   * login starts. The issued URL wins afterwards: the server moves to a free
   * port when the default one is taken.
   */
  callbackHint?: string;
}

export const ACCOUNT_PROVIDERS: readonly AccountProvider[] = [
  {
    id: "codex",
    group: "browser",
    icon: "codex",
    copyKey: "codex",
    methods: ["oauth", "refresh-token"],
    oauth: "codex",
    callbackHint: "http://localhost:1455/auth/callback",
  },
  {
    id: "anthropic",
    group: "browser",
    icon: "claude",
    copyKey: "anthropic",
    methods: ["oauth", "session"],
    oauth: "anthropic",
    callbackHint: "http://localhost:54545/callback",
  },
  {
    id: "gemini-cli",
    group: "browser",
    icon: "gemini",
    copyKey: "gemini_cli",
    methods: ["oauth"],
    oauth: "gemini-cli",
    callbackHint: "http://localhost:8085/oauth2callback",
    projectId: true,
  },
  {
    id: "antigravity",
    group: "browser",
    icon: "antigravity",
    copyKey: "antigravity",
    methods: ["oauth", "refresh-token"],
    oauth: "antigravity",
    callbackHint: "http://localhost:51121/oauth-callback",
  },
  {
    id: "xai",
    group: "browser",
    icon: "grok",
    copyKey: "xai",
    methods: ["oauth", "sso-cookie"],
    oauth: "xai",
    callbackHint: "http://127.0.0.1:56121/callback",
    endpointMode: true,
  },
  {
    id: "iflow",
    group: "browser",
    icon: "iflow",
    copyKey: "iflow",
    methods: ["oauth", "cookie"],
    oauth: "iflow",
    callbackHint: "http://localhost:11451/oauth2callback",
  },
  { id: "qwen", group: "device", icon: "qwen", copyKey: "qwen", methods: ["oauth"], oauth: "qwen" },
  { id: "kimi", group: "device", icon: "kimi", copyKey: "kimi", methods: ["oauth"], oauth: "kimi" },
  {
    id: "vertex",
    group: "import",
    icon: "vertex",
    copyKey: "vertex",
    methods: ["service-account"],
  },
  { id: "auth-file", group: "import", icon: "", copyKey: "auth_file", methods: ["auth-file"] },
];

export const ACCOUNT_GROUPS: readonly AccountGroup[] = ["browser", "device", "import"];

export const findAccountProvider = (id: AccountProviderId): AccountProvider =>
  ACCOUNT_PROVIDERS.find((provider) => provider.id === id) ?? ACCOUNT_PROVIDERS[0]!;

/**
 * File types in the AI accounts list → the entry that adds one. Opening the
 * dialog while the list is filtered to a provider preselects that provider;
 * the old mapping only knew OAuth tab names, so a "claude" filter opened Codex.
 */
const PROVIDER_ALIASES: Record<string, AccountProviderId> = {
  codex: "codex",
  openai: "codex",
  anthropic: "anthropic",
  claude: "anthropic",
  "gemini-cli": "gemini-cli",
  gemini: "gemini-cli",
  antigravity: "antigravity",
  xai: "xai",
  grok: "xai",
  iflow: "iflow",
  qwen: "qwen",
  kimi: "kimi",
  vertex: "vertex",
};

export function resolveAccountProvider(hint?: string | null): AccountProviderId {
  const key = hint?.trim().toLowerCase() ?? "";
  return PROVIDER_ALIASES[key] ?? "codex";
}
