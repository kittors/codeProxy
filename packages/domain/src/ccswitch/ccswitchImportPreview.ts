import { buildCcSwitchCodexConfigToml } from "./ccswitchCodexConfig";
import { buildCcSwitchLinkConfig } from "./ccswitchImport";
import type { CcSwitchImportPlan } from "./ccswitchImportPlan";

export type CcSwitchPreviewLanguage = "json" | "toml" | "dotenv" | "yaml";

/** One file CC Switch writes for the imported provider, as it would look after the import. */
export interface CcSwitchImportPreviewFile {
  path: string;
  language: CcSwitchPreviewLanguage;
  content: string;
}

const MASKED_KEY_PLACEHOLDER = "sk-••••••••";

/** Keeps a key recognisable without showing it: `sk-a••••wxyz`. */
export function maskCcSwitchApiKey(apiKey: string): string {
  const key = apiKey.trim();
  if (!key) return MASKED_KEY_PLACEHOLDER;
  if (key.length <= 8) return "••••••••";
  return `${key.slice(0, 4)}••••${key.slice(-4)}`;
}

/**
 * CC Switch names an imported provider `<name>-<timestamp>`, keeping only letters, digits,
 * `-` and `_` of the name, lower-cased (`deeplink::provider::import_provider_from_deeplink`).
 * The additive apps use that id as the provider's key in their own config.
 */
export function ccSwitchProviderIdPreview(name: string): string {
  const sanitized = Array.from(name)
    .filter((char) => /[\p{L}\p{N}_-]/u.test(char))
    .join("")
    .toLowerCase();
  return `${sanitized || "provider"}-<timestamp>`;
}

const json = (value: unknown) => JSON.stringify(value, null, 2);
/** YAML accepts JSON's double-quoted strings, which keeps any model name unambiguous. */
const yamlString = (value: string) => JSON.stringify(value);

/** Words the preview puts inside a file; the caller localizes them. */
export interface CcSwitchImportPreviewLabels {
  /** TOML comment above Codex's `requires_openai_auth`. */
  codexLoginNote: string;
}

const DEFAULT_PREVIEW_LABELS: CcSwitchImportPreviewLabels = {
  codexLoginNote: "true when this computer is signed in to ChatGPT",
};

/**
 * What CC Switch v4.0.10 writes when the plan's link is imported (and, for Claude Code /
 * Codex / Gemini CLI, switched to). Built from the same plan as the link and with the
 * link's own `config` payload, so the two cannot disagree; the key is masked.
 * Files list only the provider's part — CC Switch merges it into the existing file.
 */
export function buildCcSwitchImportPreview(
  plan: CcSwitchImportPlan,
  labels: CcSwitchImportPreviewLabels = DEFAULT_PREVIEW_LABELS,
): CcSwitchImportPreviewFile[] {
  const apiKey = maskCcSwitchApiKey(plan.apiKey);
  const model = plan.model;

  switch (plan.client.type) {
    case "claude": {
      const tiers = plan.claudeTiers;
      const env: Record<string, string> = {
        ANTHROPIC_AUTH_TOKEN: apiKey,
        ANTHROPIC_BASE_URL: plan.endpoint,
        ...(model ? { ANTHROPIC_MODEL: model } : {}),
        ...(tiers?.haiku ? { ANTHROPIC_DEFAULT_HAIKU_MODEL: tiers.haiku } : {}),
        ...(tiers?.sonnet ? { ANTHROPIC_DEFAULT_SONNET_MODEL: tiers.sonnet } : {}),
        ...(tiers?.opus ? { ANTHROPIC_DEFAULT_OPUS_MODEL: tiers.opus } : {}),
      };
      // The link's config env (the Fable tier) is merged under the URL parameters, which
      // win on a clash — the order CC Switch merges them in.
      const linkEnv = (buildCcSwitchLinkConfig(plan)?.env ?? {}) as Record<string, string>;
      for (const [key, value] of Object.entries(linkEnv)) {
        if (!(key in env)) env[key] = value;
      }
      return [{ path: "~/.claude/settings.json", language: "json", content: json({ env }) }];
    }
    case "codex":
      // The same config.toml the link carries, rendered the way CC Switch writes it: the key
      // lands in the provider table, and auth.json is left to the official ChatGPT login.
      return [
        {
          path: "~/.codex/config.toml",
          language: "toml",
          content: buildCcSwitchCodexConfigToml({
            model,
            reasoningEffort: plan.codex?.reasoningEffort ?? "",
            contextWindow: plan.codex?.contextWindow ?? null,
            providerName: plan.name,
            endpoint: plan.endpoint,
            written: { bearerToken: apiKey, loginNote: labels.codexLoginNote },
          }),
        },
      ];
    case "gemini":
      return [
        {
          path: "~/.gemini/.env",
          language: "dotenv",
          content: [
            `GEMINI_API_KEY=${apiKey}`,
            `GOOGLE_GEMINI_BASE_URL=${plan.endpoint}`,
            ...(model ? [`GEMINI_MODEL=${model}`] : []),
          ].join("\n"),
        },
      ];
    case "opencode": {
      const provider = {
        npm: "@ai-sdk/openai-compatible",
        options: { baseURL: plan.endpoint, apiKey },
        models: model ? { [model]: { name: model } } : {},
      };
      return [
        {
          path: "~/.config/opencode/opencode.json",
          language: "json",
          content: json({ provider: { [ccSwitchProviderIdPreview(plan.name)]: provider } }),
        },
      ];
    }
    case "openclaw": {
      const provider = {
        baseUrl: plan.endpoint,
        apiKey,
        api: "openai-completions",
        ...(model ? { models: [{ id: model, name: model }] } : {}),
      };
      return [
        {
          path: "~/.openclaw/openclaw.json",
          language: "json",
          content: json({
            models: { providers: { [ccSwitchProviderIdPreview(plan.name)]: provider } },
          }),
        },
      ];
    }
    case "hermes": {
      // Hermes rows are keyed by `name`, which CC Switch sets to the provider id, and carry
      // the first model again as `model` for Hermes' picker.
      const lines = [
        "custom_providers:",
        `  - name: ${yamlString(ccSwitchProviderIdPreview(plan.name))}`,
        `    base_url: ${yamlString(plan.endpoint)}`,
        `    api_key: ${yamlString(apiKey)}`,
        `    api_mode: "chat_completions"`,
      ];
      if (model) {
        lines.push(
          `    model: ${yamlString(model)}`,
          "    models:",
          `      ${yamlString(model)}:`,
          `        name: ${yamlString(model)}`,
        );
      }
      return [{ path: "~/.hermes/config.yaml", language: "yaml", content: lines.join("\n") }];
    }
  }
}
