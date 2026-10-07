import { describe, expect, test } from "vitest";
import en from "../locales/en.json";
import ru from "../locales/ru.json";

function collectStrings(node: unknown, prefix = "", out = new Map<string, string>()) {
  if (typeof node === "string") {
    out.set(prefix, node);
  } else if (Array.isArray(node)) {
    node.forEach((item, index) => collectStrings(item, `${prefix}.${index}`, out));
  } else if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      collectStrings(value, prefix ? `${prefix}.${key}` : key, out);
    }
  }
  return out;
}

// Placeholders are filled in at runtime; only the text around them needs translating.
const hasLatinText = (value: string) => /[A-Za-z]/.test(value.replace(/\{\{[^}]+\}\}/g, ""));

/*
 * ru.json may leave a key out — i18next then falls back to English (see ../index.ts) — but a key
 * it does carry must be Russian. An English value copied into ru.json passes every "key exists"
 * check while the Russian UI still shows English, which is how ~1000 strings piled up unnoticed.
 * These are the only values allowed to match en.json byte for byte: names and identifiers that
 * read the same in a Russian UI.
 */
const SAME_AS_ENGLISH = new Set<string>([
  // Product, client and vendor names
  "title.abbr",
  "splash.title",
  "ccswitch.client_claude_code",
  "ccswitch.client_codex",
  "ccswitch.client_gemini_cli",
  "apikey_lookup.quick_import_codex",
  "apikey_lookup.quick_import_claude",
  "content_moderation.backend_openai_moderations",
  "content_moderation.backend_qwen3guard",
  "add_account.providers.codex.name",
  "add_account.providers.anthropic.name",
  "add_account.providers.gemini_cli.name",
  "add_account.providers.antigravity.name",
  "add_account.providers.xai.name",
  "add_account.providers.iflow.name",
  "add_account.providers.qwen.name",
  "add_account.providers.kimi.name",
  "add_account.providers.vertex.name",
  "auth_files.filter_qwen",
  "auth_files.filter_gemini",
  "auth_files.filter_gemini-cli",
  "auth_files.filter_kimi",
  "auth_files.filter_aistudio",
  "auth_files.filter_claude",
  "auth_files.filter_codex",
  "auth_files.filter_antigravity",
  "auth_files.filter_iflow",
  "auth_files.filter_vertex",
  "auth_files.filter_xai",
  "auth_files.type_qwen",
  "auth_files.type_gemini",
  "auth_files.type_gemini-cli",
  "auth_files.type_kimi",
  "auth_files.type_aistudio",
  "auth_files.type_claude",
  "auth_files.type_codex",
  "auth_files.type_antigravity",
  "auth_files.type_iflow",
  "auth_files.type_vertex",
  "auth_files.type_xai",
  "config_management.visual.payload_rules.provider_openai",
  "config_management.visual.payload_rules.provider_openai_response",
  "config_management.visual.payload_rules.provider_gemini",
  "config_management.visual.payload_rules.provider_claude",
  "config_management.visual.payload_rules.provider_codex",
  "config_management.visual.payload_rules.provider_antigravity",
  "auth_login.codex_oauth_title",
  "auth_login.anthropic_oauth_title",
  "auth_login.antigravity_oauth_title",
  "auth_login.gemini_cli_oauth_title",
  "auth_login.kimi_oauth_title",
  "auth_login.qwen_oauth_title",
  "auth_login.iflow_oauth_title",
  // Vendor plan names and quota bucket codenames
  "codex_quota.plan_plus",
  "codex_quota.plan_team",
  "codex_quota.plan_free",
  "xai_quota.plan_supergrok",
  "xai_quota.plan_supergrok_heavy",
  "claude_quota.iguana_necktie",
  // The language switcher names each language in itself
  "language.english",
  // Header and environment variable names, config syntax
  "ccswitch.auth_field_anthropic_api_key",
  "ccswitch.auth_field_anthropic_auth_token",
  "identity_fingerprint.user_agent",
  "identity_fingerprint.version",
  "identity_fingerprint.originator",
  "identity_fingerprint.websocket_beta",
  "config_ui.fields.kimi_user_agent.label",
  "config_ui.fields.kimi_platform.label",
  "config_ui.fields.kimi_version.label",
  "config_management.visual.payload_rules.value_type_json",
  "config_management.editor_placeholder",
  // Metric abbreviations and status codes
  "api_key_permissions_page.limit_rpm_tpm",
  "usage_stats.rpm_30m",
  "usage_stats.tpm_30m",
  "dashboard.provider_keys_detail",
  "channel_groups_page.priority_short",
  "auth_files.status_filter_http-5xx",
  // Literal examples and URLs
  "vertex_import.location_placeholder",
  "auth_login.oauth_callback_placeholder",
  "add_account.import.iflow_placeholder",
  "add_account.credential.anthropic_session.where_url",
  "add_account.credential.codex_refresh.where_url",
  "add_account.credential.antigravity_refresh.where_url",
  "add_account.credential.xai_sso.where_url",
  // A picture of Anthropic's own authorization page, which is in English
  "add_account.mock.code_title",
  "add_account.mock.copy",
  // Their Russian siblings keep these as terms ("Upstream API-ключ", "Отправить Callback URL")
  "ai_providers.ampcode_upstream_url_label",
  "auth_login.oauth_callback_label",
]);

describe("ru translation coverage", () => {
  const enStrings = collectStrings(en);
  const ruStrings = collectStrings(ru);

  test("ru.json carries no English copies", () => {
    const copied = [...ruStrings]
      .filter(([key, value]) => enStrings.get(key) === value && hasLatinText(value))
      .map(([key]) => key)
      .filter((key) => !SAME_AS_ENGLISH.has(key));
    // Translate these, or drop them from ru.json so they fall back to English on purpose.
    expect(copied).toEqual([]);
  });

  test("every allowed English value is still present and still English", () => {
    const stale = [...SAME_AS_ENGLISH].filter(
      (key) => !ruStrings.has(key) || ruStrings.get(key) !== enStrings.get(key),
    );
    expect(stale).toEqual([]);
  });
});
