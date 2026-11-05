import { describe, expect, test } from "vitest";
import type {
  BedrockProviderConfig,
  OpenAIProvider,
  ProviderApiKeyEntry,
  ProviderModel,
  ProviderSimpleConfig,
} from "../../dto/types";
import {
  serializeBedrockKey,
  serializeClineKey,
  serializeCommandCodeKey,
  serializeGeminiKey,
  serializeModels,
  serializeOllamaCloudKey,
  serializeOpenAIProvider,
  serializeOpenCodeGoKey,
  serializeProviderKey,
} from "../helpers";
import {
  API_KEY_ENTRY_WIRE_KEYS,
  BEDROCK_KEY_WIRE_KEYS,
  CLINE_KEY_WIRE_KEYS,
  COMMAND_CODE_KEY_WIRE_KEYS,
  GEMINI_KEY_WIRE_KEYS,
  MODEL_WIRE_KEYS,
  OLLAMA_CLOUD_KEY_WIRE_KEYS,
  OPENAI_PROVIDER_WIRE_KEYS,
  OPENCODE_GO_KEY_WIRE_KEYS,
  PROVIDER_KEY_WIRE_KEYS,
} from "../provider-fields";

/**
 * 每个 serializer 的「负责的键」清单必须和它实际写出的键完全一致。
 *
 * 整表保存时以后端原始记录为底、先删掉清单里的键再叠上建模字段：
 * - 清单漏记了 serializer 写出的键：用户清空这个字段后，旧值会从原始记录里复活；
 * - 清单多记了 serializer 不写的键：后端有的字段被当成「面板负责」而被删掉，保存一次就丢。
 *
 * 下面的夹具都标成 Required<...>：DTO 新增字段而这里没填，`tsc --noEmit`（bun run build）就过不了，
 * 这样「所有字段都填满」才名副其实，新字段也就逃不出这个测试。
 */

const MODEL: Required<ProviderModel> = {
  name: "upstream-model",
  alias: "client-alias",
  priority: 2,
  testModel: "probe-model",
};

const ENTRY: Required<ProviderApiKeyEntry> = {
  id: "entry-1",
  apiKey: "sk-entry",
  disabled: true,
  proxyUrl: "http://proxy.example:7890",
  proxyId: "hk",
  headers: { "X-Key": "1" },
};

const SIMPLE: Required<ProviderSimpleConfig> = {
  id: "key-1",
  apiKey: "sk-key",
  disabled: true,
  name: "Main",
  prefix: "team-a",
  baseUrl: "https://upstream.example/v1",
  proxyUrl: "http://proxy.example:7890",
  proxyId: "hk",
  headers: { "X-Team": "ops" },
  models: [MODEL],
  excludedModels: ["blocked-*", "*"],
  visionFallbackModel: "vision-model",
  authCookie: "session=1",
  skipAnthropicProcessing: true,
  disableCooling: true,
};

const BEDROCK_API_KEY: Required<BedrockProviderConfig> = {
  ...SIMPLE,
  authMode: "api-key",
  accessKeyId: "AKIA",
  secretAccessKey: "SECRET",
  sessionToken: "SESSION",
  region: "eu-west-1",
  forceGlobal: true,
};
const BEDROCK_SIGV4: Required<BedrockProviderConfig> = { ...BEDROCK_API_KEY, authMode: "sigv4" };

const OPENAI: Required<OpenAIProvider> = {
  id: "provider-1",
  name: "Relay",
  disabled: true,
  baseUrl: "https://relay.example/v1",
  prefix: "relay",
  headers: { "X-Team": "ops" },
  models: [MODEL],
  apiKeyEntries: [ENTRY],
  priority: 3,
  testModel: "probe-model",
  disableCooling: false,
};

const keysOf = (...records: Record<string, unknown>[]) =>
  [...new Set(records.flatMap((record) => Object.keys(record)))].sort();

describe("serializer owned-key lists", () => {
  test.each([
    {
      name: "serializeProviderKey (claude, codex, vertex)",
      written: () => keysOf(serializeProviderKey(SIMPLE)),
      owned: PROVIDER_KEY_WIRE_KEYS,
    },
    {
      name: "serializeGeminiKey",
      written: () => keysOf(serializeGeminiKey(SIMPLE)),
      owned: GEMINI_KEY_WIRE_KEYS,
    },
    {
      name: "serializeOpenCodeGoKey",
      written: () => keysOf(serializeOpenCodeGoKey(SIMPLE)),
      owned: OPENCODE_GO_KEY_WIRE_KEYS,
    },
    {
      name: "serializeClineKey",
      written: () => keysOf(serializeClineKey(SIMPLE)),
      owned: CLINE_KEY_WIRE_KEYS,
    },
    {
      name: "serializeOllamaCloudKey",
      written: () => keysOf(serializeOllamaCloudKey(SIMPLE)),
      owned: OLLAMA_CLOUD_KEY_WIRE_KEYS,
    },
    {
      name: "serializeCommandCodeKey",
      written: () => keysOf(serializeCommandCodeKey(SIMPLE)),
      owned: COMMAND_CODE_KEY_WIRE_KEYS,
    },
    {
      name: "serializeBedrockKey (api-key and SigV4 credentials)",
      written: () =>
        keysOf(serializeBedrockKey(BEDROCK_API_KEY), serializeBedrockKey(BEDROCK_SIGV4)),
      owned: BEDROCK_KEY_WIRE_KEYS,
    },
    {
      name: "serializeOpenAIProvider",
      written: () => keysOf(serializeOpenAIProvider(OPENAI)),
      owned: OPENAI_PROVIDER_WIRE_KEYS,
    },
  ])("$name owns exactly the keys it writes", ({ written, owned }) => {
    expect(written()).toEqual([...owned].sort());
  });

  test("model entries own exactly the keys serializeModels writes", () => {
    expect(keysOf(...(serializeModels([MODEL]) as Record<string, unknown>[]))).toEqual(
      [...MODEL_WIRE_KEYS].sort(),
    );
  });

  test("api-key entries own exactly the keys serializeOpenAIProvider writes for them", () => {
    const entries = serializeOpenAIProvider(OPENAI)["api-key-entries"] as Record<string, unknown>[];
    expect(keysOf(...entries)).toEqual([...API_KEY_ENTRY_WIRE_KEYS].sort());
  });

  test("the PATCH variants write a subset of the same keys", () => {
    for (const [serialize, owned] of [
      [serializeOpenCodeGoKey, OPENCODE_GO_KEY_WIRE_KEYS],
      [serializeClineKey, CLINE_KEY_WIRE_KEYS],
      [serializeOllamaCloudKey, OLLAMA_CLOUD_KEY_WIRE_KEYS],
      [serializeCommandCodeKey, COMMAND_CODE_KEY_WIRE_KEYS],
    ] as const) {
      const patch = serialize(SIMPLE, { includeApiKey: false, keepUnmodeled: false });
      expect(patch).not.toHaveProperty("api-key");
      expect(keysOf(patch).every((key) => (owned as readonly string[]).includes(key))).toBe(true);
    }
  });
});
