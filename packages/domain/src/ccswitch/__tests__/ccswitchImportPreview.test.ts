import { describe, expect, test } from "vitest";
import {
  createCcSwitchImportConfig,
  type CcSwitchImportConfigListItem,
} from "@code-proxy/domain/ccswitch/ccswitchImportConfigList";
import { buildCcSwitchImportUrl } from "@code-proxy/domain/ccswitch/ccswitchImport";
import { resolveCcSwitchImportPlan } from "@code-proxy/domain/ccswitch/ccswitchImportPlan";
import {
  buildCcSwitchImportPreview,
  ccSwitchProviderIdPreview,
  maskCcSwitchApiKey,
} from "@code-proxy/domain/ccswitch/ccswitchImportPreview";

const ROOT = "https://relay.example.com";
const KEY = "sk-live-1234567890abcd";
const MASKED = "sk-l••••abcd";

const preset = (
  input: Partial<CcSwitchImportConfigListItem> & Pick<CcSwitchImportConfigListItem, "clientType">,
) =>
  createCcSwitchImportConfig({
    id: "cfg-1",
    providerName: "Relay",
    routePath: "/team/cs_abc123",
    allowedChannelGroups: ["team"],
    defaultModel: "kimi-k2",
    modelMappings: [{ requestModel: "kimi-k2", targetModel: "kimi-k2" }],
    ...input,
  });

/** The plan, its link parameters and its preview: one source, two renderings. */
const render = (config: CcSwitchImportConfigListItem, baseUrl = ROOT) => {
  const plan = resolveCcSwitchImportPlan({ apiKey: KEY, baseUrl, config });
  const url = buildCcSwitchImportUrl(plan);
  const params = new URLSearchParams(url.slice("ccswitch://v1/import?".length));
  return { plan, params, files: buildCcSwitchImportPreview(plan) };
};

const linkConfig = (params: URLSearchParams) =>
  JSON.parse(Buffer.from(params.get("config") ?? "", "base64").toString("utf-8")) as {
    env?: Record<string, string>;
    config?: string;
  };

describe("maskCcSwitchApiKey", () => {
  test.each([
    ["sk-live-1234567890abcd", "sk-l••••abcd"],
    ["sk-test", "••••••••"],
    ["", "sk-••••••••"],
  ])("%j → %j", (key, masked) => {
    expect(maskCcSwitchApiKey(key)).toBe(masked);
  });
});

describe("ccSwitchProviderIdPreview", () => {
  test("keeps letters, digits, - and _ of the name, lower-cased, like CC Switch's ids", () => {
    expect(ccSwitchProviderIdPreview("CliProxy OpenCode")).toBe("cliproxyopencode-<timestamp>");
    expect(ccSwitchProviderIdPreview("中转 Relay_v2!")).toBe("中转relay_v2-<timestamp>");
    expect(ccSwitchProviderIdPreview("!!!")).toBe("provider-<timestamp>");
  });
});

describe("buildCcSwitchImportPreview", () => {
  test("Claude Code: settings.json env matches the link, Fable included from config.env", () => {
    const { params, files } = render(
      preset({
        clientType: "claude",
        modelMappings: [
          { role: "main", requestModel: "claude-sonnet-5", targetModel: "kimi-k2" },
          { role: "haiku", requestModel: "claude-haiku-4-5", targetModel: "kimi-k2" },
          { role: "fable", requestModel: "claude-fable-5", targetModel: "kimi-k2" },
        ],
      }),
    );
    expect(files.map((file) => file.path)).toEqual(["~/.claude/settings.json"]);
    const { env } = JSON.parse(files[0]!.content) as { env: Record<string, string> };
    expect(env).toEqual({
      ANTHROPIC_AUTH_TOKEN: MASKED,
      ANTHROPIC_BASE_URL: params.get("endpoint"),
      ANTHROPIC_MODEL: params.get("model"),
      ANTHROPIC_DEFAULT_HAIKU_MODEL: params.get("haikuModel"),
      ANTHROPIC_DEFAULT_FABLE_MODEL: linkConfig(params).env?.ANTHROPIC_DEFAULT_FABLE_MODEL,
    });
    expect(Object.keys(env)).not.toContain("ANTHROPIC_DEFAULT_SONNET_MODEL");
    expect(files[0]!.content).not.toContain(KEY);
  });

  test("Codex: config.toml is the link's own config.toml, auth.json holds the masked key", () => {
    const { params, files } = render(
      preset({
        clientType: "codex",
        defaultModel: "gpt-5.5",
        modelMappings: [{ requestModel: "gpt-5.5", targetModel: "gpt-5.5", contextWindow: 272000 }],
      }),
    );
    expect(files.map((file) => [file.path, file.language])).toEqual([
      ["~/.codex/config.toml", "toml"],
      ["~/.codex/auth.json", "json"],
    ]);
    expect(files[0]!.content).toBe(linkConfig(params).config);
    expect(files[0]!.content).toContain("model_context_window = 272000");
    expect(JSON.parse(files[1]!.content)).toEqual({ OPENAI_API_KEY: MASKED });
  });

  test("Gemini CLI: .env lines with the endpoint and model of the link", () => {
    const { params, files } = render(
      preset({ clientType: "gemini", defaultModel: "gemini-2.5-pro" }),
    );
    expect(files).toEqual([
      {
        path: "~/.gemini/.env",
        language: "dotenv",
        content: [
          `GEMINI_API_KEY=${MASKED}`,
          `GOOGLE_GEMINI_BASE_URL=${params.get("endpoint")}`,
          "GEMINI_MODEL=gemini-2.5-pro",
        ].join("\n"),
      },
    ]);
  });

  test("OpenCode: an openai-compatible provider under the CC Switch provider id", () => {
    const { params, files } = render(preset({ clientType: "opencode", providerName: "Relay OC" }));
    expect(files[0]!.path).toBe("~/.config/opencode/opencode.json");
    expect(JSON.parse(files[0]!.content)).toEqual({
      provider: {
        "relayoc-<timestamp>": {
          npm: "@ai-sdk/openai-compatible",
          options: { baseURL: params.get("endpoint"), apiKey: MASKED },
          models: { "kimi-k2": { name: "kimi-k2" } },
        },
      },
    });
  });

  test("OpenClaw: models.providers entry speaking openai-completions", () => {
    const { params, files } = render(preset({ clientType: "openclaw", providerName: "Relay" }));
    expect(files[0]!.path).toBe("~/.openclaw/openclaw.json");
    expect(JSON.parse(files[0]!.content)).toEqual({
      models: {
        providers: {
          "relay-<timestamp>": {
            baseUrl: params.get("endpoint"),
            apiKey: MASKED,
            api: "openai-completions",
            models: [{ id: "kimi-k2", name: "kimi-k2" }],
          },
        },
      },
    });
  });

  test("Hermes: a custom_providers row in chat_completions mode", () => {
    const { params, files } = render(preset({ clientType: "hermes", providerName: "Relay" }));
    expect(files[0]).toEqual({
      path: "~/.hermes/config.yaml",
      language: "yaml",
      content: [
        "custom_providers:",
        '  - name: "relay-<timestamp>"',
        `    base_url: "${params.get("endpoint")}"`,
        `    api_key: "${MASKED}"`,
        '    api_mode: "chat_completions"',
        '    model: "kimi-k2"',
        "    models:",
        '      "kimi-k2":',
        '        name: "kimi-k2"',
      ].join("\n"),
    });
  });

  test("every app's preview carries the link's endpoint and never the key itself", () => {
    for (const clientType of [
      "claude",
      "codex",
      "gemini",
      "opencode",
      "openclaw",
      "hermes",
    ] as const) {
      const { params, files } = render(preset({ clientType }), "http://localhost:8317");
      const text = files.map((file) => file.content).join("\n");
      expect(text, clientType).toContain(params.get("endpoint") ?? "<missing>");
      expect(text, clientType).not.toContain(KEY);
    }
  });
});
