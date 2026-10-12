import { describe, expect, test } from "vitest";
import {
  createCcSwitchImportConfig,
  type CcSwitchImportConfigListItem,
} from "@code-proxy/domain/ccswitch/ccswitchImportConfigList";
import { buildCcSwitchImportUrlForConfig } from "@code-proxy/domain/ccswitch/ccswitchImportLinks";
import { canCcSwitchQueryUsage } from "@code-proxy/domain/ccswitch/ccswitchUsageScript";

const PREFIX = "ccswitch://v1/import?";
const ROOT = "https://relay.example.com";
const USAGE_KEYS = ["usageEnabled", "usageScript", "usageBaseUrl", "usageAutoInterval"];
/** Parameters CC Switch v4.0.10 does not read; earlier panels sent them. */
const DEAD_KEYS = ["apiKeyField", "fableModel", "apiFormat", "modelCatalog", "model_catalog_json"];

const preset = (
  input: Partial<CcSwitchImportConfigListItem> & Pick<CcSwitchImportConfigListItem, "clientType">,
) =>
  createCcSwitchImportConfig({
    id: "cfg-1",
    providerName: "Relay",
    routePath: "/team/cs_abc123",
    allowedChannelGroups: ["team"],
    ...input,
  });

const link = (
  config: CcSwitchImportConfigListItem,
  overrides: { baseUrl?: string; apiKey?: string; routePath?: string; usageLanguage?: string } = {},
) => {
  const url = buildCcSwitchImportUrlForConfig({
    apiKey: overrides.apiKey ?? "sk-test",
    baseUrl: overrides.baseUrl ?? ROOT,
    config,
    routePath: overrides.routePath,
    usageLanguage: overrides.usageLanguage ?? "zh-CN",
  });
  expect(url.startsWith(PREFIX)).toBe(true);
  return { url, params: new URLSearchParams(url.slice(PREFIX.length)) };
};

const keysOf = (params: URLSearchParams) => [...params.keys()];
const decode = (value: string | null) => Buffer.from(value ?? "", "base64").toString("utf-8");
const decodeJson = (value: string | null) => JSON.parse(decode(value)) as Record<string, unknown>;

describe("CC Switch links: Claude Code", () => {
  test("a main model alone sends only the main model and keeps every other tier out", () => {
    const { params } = link(
      preset({
        clientType: "claude",
        modelMappings: [{ role: "main", requestModel: "kimi-k2", targetModel: "kimi-k2" }],
      }),
    );

    expect(keysOf(params)).toEqual([
      "resource",
      "app",
      "name",
      "endpoint",
      "apiKey",
      "homepage",
      "icon",
      "enabled",
      "model",
      ...USAGE_KEYS,
    ]);
    expect(params.get("resource")).toBe("provider");
    expect(params.get("app")).toBe("claude");
    expect(params.get("name")).toBe("Relay");
    // Claude Code adds /v1/messages itself, so the endpoint is the bare route.
    expect(params.get("endpoint")).toBe(`${ROOT}/team/cs_abc123`);
    expect(params.get("apiKey")).toBe("sk-test");
    expect(params.get("homepage")).toBe(ROOT);
    expect(params.get("icon")).toBe("claude");
    expect(params.get("enabled")).toBe("true");
    expect(params.get("model")).toBe("kimi-k2");
    for (const key of [
      "haikuModel",
      "sonnetModel",
      "opusModel",
      "config",
      "configFormat",
      "notes",
    ]) {
      expect(params.has(key)).toBe(false);
    }
    for (const key of DEAD_KEYS) expect(params.has(key)).toBe(false);
  });

  test("tiers use their request names and Fable travels in config.env", () => {
    const { params } = link(
      preset({
        clientType: "claude",
        note: "Team preset",
        modelMappings: [
          { role: "main", requestModel: "claude-sonnet-5", targetModel: "claude-sonnet-5" },
          { role: "haiku", requestModel: "claude-haiku-4-5", targetModel: "claude-haiku-4-5" },
          { role: "sonnet", requestModel: "claude-sonnet-5", targetModel: "claude-sonnet-5" },
          { role: "opus", requestModel: "claude-opus-4-8", targetModel: "claude-opus-4-8" },
          { role: "fable", requestModel: "claude-fable-5", targetModel: "claude-opus-4-8" },
        ],
      }),
    );

    expect(params.get("model")).toBe("claude-sonnet-5");
    expect(params.get("haikuModel")).toBe("claude-haiku-4-5");
    expect(params.get("sonnetModel")).toBe("claude-sonnet-5");
    expect(params.get("opusModel")).toBe("claude-opus-4-8");
    expect(params.get("notes")).toBe("Team preset");
    expect(params.has("fableModel")).toBe(false);
    expect(params.get("configFormat")).toBe("json");
    expect(decodeJson(params.get("config"))).toEqual({
      env: { ANTHROPIC_DEFAULT_FABLE_MODEL: "claude-fable-5" },
    });
  });

  test("alias mappings from earlier editors keep sending their request names", () => {
    const { params } = link(
      preset({
        clientType: "claude",
        defaultModel: "grok-4.5",
        modelMappings: [
          { role: "main", requestModel: "claude-fable-5", targetModel: "grok-4.5" },
          { role: "haiku", requestModel: "claude-haiku-4-5", targetModel: "grok-4.5" },
          { role: "fable", requestModel: "claude-fable-5", targetModel: "grok-4.5" },
        ],
      }),
    );

    // The route rewrites these names to grok-4.5; the link must not send the target.
    expect(params.get("model")).toBe("claude-fable-5");
    expect(params.get("haikuModel")).toBe("claude-haiku-4-5");
    expect(decodeJson(params.get("config"))).toEqual({
      env: { ANTHROPIC_DEFAULT_FABLE_MODEL: "claude-fable-5" },
    });
  });

  test("a preset without a main mapping falls back to its default model", () => {
    const { params } = link(preset({ clientType: "claude", defaultModel: "claude-sonnet-5" }));
    expect(params.get("model")).toBe("claude-sonnet-5");
  });
});

describe("CC Switch links: Codex", () => {
  const codexPreset = (codexContextWindow?: number) =>
    preset({
      clientType: "codex",
      providerName: "Relay Codex",
      defaultModel: "gpt-5.5",
      ...(codexContextWindow ? { codexContextWindow } : {}),
      modelMappings: [
        { requestModel: "gpt-5.5", targetModel: "gpt-5.5" },
        { requestModel: "kimi-k2", targetModel: "kimi-k2" },
      ],
    });

  test("the endpoint ends in /v1, the model is explicit and config carries auth + config.toml", () => {
    const { params } = link(codexPreset());

    expect(params.get("app")).toBe("codex");
    // `codex` is not a CC Switch built-in icon; Codex shows the OpenAI mark.
    expect(params.get("icon")).toBe("openai");
    expect(params.get("endpoint")).toBe(`${ROOT}/team/cs_abc123/v1`);
    expect(params.get("model")).toBe("gpt-5.5");
    expect(params.get("enabled")).toBe("true");
    expect(params.get("configFormat")).toBe("json");
    for (const key of DEAD_KEYS) expect(params.has(key)).toBe(false);

    const config = decodeJson(params.get("config"));
    expect(Object.keys(config)).toEqual(["auth", "config"]);
    expect(config.auth).toEqual({ OPENAI_API_KEY: "sk-test" });
    expect(config.config).toBe(
      [
        `model_provider = "custom"`,
        `model = "gpt-5.5"`,
        `model_reasoning_effort = "high"`,
        "disable_response_storage = true",
        "",
        "[model_providers.custom]",
        `name = "Relay Codex"`,
        `base_url = "${ROOT}/team/cs_abc123/v1"`,
        `wire_api = "responses"`,
        "requires_openai_auth = true",
      ].join("\n"),
    );
    expect(String(config.config)).not.toContain("model_catalog_json");
  });

  test("model_context_window comes from the preset's own context window only", () => {
    const withWindow = decodeJson(link(codexPreset(272000)).params.get("config"));
    expect(withWindow.config).toContain(
      "disable_response_storage = true\nmodel_context_window = 272000\n",
    );
    const withoutWindow = decodeJson(link(codexPreset()).params.get("config"));
    expect(withoutWindow.config).not.toContain("model_context_window");
  });

  test("per-mapping context windows saved by earlier editors never reach the link", () => {
    // The earlier editor pre-filled 128000 on every Codex mapping.
    const legacy = preset({
      clientType: "codex",
      defaultModel: "gpt-5.5",
      modelMappings: [
        { requestModel: "gpt-5.5", targetModel: "gpt-5.5", contextWindow: 128000 },
        { requestModel: "kimi-k2", targetModel: "kimi-k2", contextWindow: 128000 },
      ],
    });
    expect(decodeJson(link(legacy).params.get("config")).config).not.toContain(
      "model_context_window",
    );
    const withPresetWindow = { ...legacy, codexContextWindow: 400000 };
    expect(decodeJson(link(withPresetWindow).params.get("config")).config).toContain(
      "model_context_window = 400000",
    );
  });

  test("the reasoning effort comes from the backend catalog, falling back to high", () => {
    const withCatalog = { ...codexPreset(), codexReasoningEfforts: { "gpt-5.5": "medium" } };
    const decoded = decodeJson(link(withCatalog).params.get("config"));
    expect(decoded.config).toContain(`model_reasoning_effort = "medium"`);
    expect(Object.keys(decoded)).not.toContain("modelCatalog");

    const otherModel = { ...codexPreset(), codexReasoningEfforts: { "kimi-k2": "low" } };
    expect(decodeJson(link(otherModel).params.get("config")).config).toContain(
      `model_reasoning_effort = "high"`,
    );
  });

  test("an alias default keeps its request name in the link and in config.toml", () => {
    const { params } = link(
      preset({
        clientType: "codex",
        defaultModel: "gpt-5.4",
        modelMappings: [{ requestModel: "gpt-5.4", targetModel: "deepseek-v4-flash" }],
      }),
    );
    expect(params.get("model")).toBe("gpt-5.4");
    expect(decodeJson(params.get("config")).config).toContain(`model = "gpt-5.4"`);
  });
});

describe("CC Switch links: Gemini CLI", () => {
  test("the endpoint is the bare route and the model goes to GEMINI_MODEL", () => {
    const { params } = link(
      preset({
        clientType: "gemini",
        providerName: "Relay Gemini",
        defaultModel: "gemini-2.5-pro",
        modelMappings: [{ requestModel: "gemini-2.5-pro", targetModel: "gemini-2.5-pro" }],
      }),
    );
    expect(params.get("app")).toBe("gemini");
    expect(params.get("icon")).toBe("gemini");
    expect(params.get("endpoint")).toBe(`${ROOT}/team/cs_abc123`);
    expect(params.get("model")).toBe("gemini-2.5-pro");
    expect(params.get("enabled")).toBe("true");
    expect(params.has("config")).toBe(false);
    expect(params.has("configFormat")).toBe(false);
  });

  test.each([
    ["Google", "CliProxy Google"],
    ["google relay", "CliProxy google relay"],
    ["  GOOGLE Pro  ", "CliProxy GOOGLE Pro"],
    ["Googleplex", "Googleplex"],
    ["My Google relay", "My Google relay"],
  ])("a name %j is sent as %j so CC Switch does not switch to Google OAuth", (name, sent) => {
    const { params } = link(
      preset({ clientType: "gemini", providerName: name, defaultModel: "gemini-2.5-pro" }),
    );
    expect(params.get("name")).toBe(sent);
  });
});

describe("CC Switch links: OpenCode, OpenClaw and Hermes", () => {
  test.each([
    ["opencode", "opencode"],
    ["openclaw", "openclaw"],
    ["hermes", "hermes"],
  ] as const)(
    "%s gets a /v1 endpoint and a model, but no enabled and no config",
    (clientType, icon) => {
      const { params } = link(
        preset({
          clientType,
          defaultModel: "kimi-k2",
          modelMappings: [{ requestModel: "kimi-k2", targetModel: "kimi-k2" }],
        }),
      );
      expect(params.get("app")).toBe(clientType);
      expect(params.get("icon")).toBe(icon);
      expect(params.get("endpoint")).toBe(`${ROOT}/team/cs_abc123/v1`);
      expect(params.get("model")).toBe("kimi-k2");
      for (const key of ["enabled", "config", "configFormat", "apiFormat"]) {
        expect(params.has(key)).toBe(false);
      }
    },
  );

  test("names lose the ${…}, {env:…} and {file:…} openers these apps would expand", () => {
    const { params } = link(
      preset({ clientType: "opencode", providerName: "Relay ${HOME} {env:KEY} {file:~/.ssh/id}" }),
    );
    const name = params.get("name") ?? "";
    expect(name).toBe("Relay $HOME} env:KEY} file:~/.ssh/id}");
    expect(name).not.toMatch(/\$\{|\{env:|\{file:/);
  });
});

describe("CC Switch links: shared rules", () => {
  const codex = () =>
    preset({
      clientType: "codex",
      defaultModel: "gpt-5.5",
      modelMappings: [{ requestModel: "gpt-5.5", targetModel: "gpt-5.5" }],
    });

  test("the usage query is included over HTTPS and points at the root, not the route", () => {
    const { params } = link(codex(), { usageLanguage: "en" });
    expect(params.get("usageEnabled")).toBe("true");
    expect(params.get("usageBaseUrl")).toBe(ROOT);
    expect(params.get("usageAutoInterval")).toBe("30");
    const script = decode(params.get("usageScript"));
    expect(script).toContain('url: "{{baseUrl}}/v0/management/public/usage/summary"');
    expect(script).toContain("Today's usage");
  });

  test.each([
    ["http://relay.example.com:8317", false],
    ["http://203.0.113.7:8317", false],
    ["http://localhost:8317", true],
    ["http://127.0.0.1:8317", true],
    ["http://[::1]:8317", true],
    ["https://203.0.113.7:8443", true],
  ])("usage parameters for %s: %s", (baseUrl, included) => {
    const { params } = link(codex(), { baseUrl });
    for (const key of USAGE_KEYS) expect(params.has(key)).toBe(included);
    expect(canCcSwitchQueryUsage(baseUrl)).toBe(included);
  });

  test("empty values never become parameters", () => {
    const { params } = link(
      preset({ clientType: "opencode", providerName: "Relay", note: "   ", defaultModel: "" }),
    );
    expect(params.has("model")).toBe(false);
    expect(params.has("notes")).toBe(false);
    for (const [key, value] of params) {
      expect(value.trim(), `${key} is empty`).not.toBe("");
    }
  });

  test("Base64 and API key plus signs are percent-encoded", () => {
    const { url, params } = link(codex(), { apiKey: "sk-a+b/c=" });
    expect(url).toContain("apiKey=sk-a%2Bb%2Fc%3D");
    expect(params.get("apiKey")).toBe("sk-a+b/c=");
    expect(url).not.toMatch(/usageScript=[^&]*\+/);
  });

  test("a management base URL is cut back to the root and the route override wins", () => {
    const { params } = link(preset({ clientType: "gemini", routePath: "" }), {
      baseUrl: `${ROOT}/v0/management/`,
      routePath: "/pro",
    });
    expect(params.get("homepage")).toBe(ROOT);
    expect(params.get("endpoint")).toBe(`${ROOT}/pro`);
  });

  test("a preset without a name falls back to the caller's name, then to CliProxy <app>", () => {
    const unnamed = { ...preset({ clientType: "codex" }), providerName: "" };
    const fromCaller = buildCcSwitchImportUrlForConfig({
      apiKey: "sk-test",
      baseUrl: ROOT,
      config: unnamed,
      providerName: "Key owner",
    });
    expect(new URLSearchParams(fromCaller.slice(PREFIX.length)).get("name")).toBe("Key owner");
    expect(link(unnamed).params.get("name")).toBe("CliProxy Codex");
  });
});
