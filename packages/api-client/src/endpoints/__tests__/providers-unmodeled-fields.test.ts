import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  BEDROCK_KEY_WIRE_KEYS,
  CLINE_KEY_WIRE_KEYS,
  COMMAND_CODE_KEY_WIRE_KEYS,
  GEMINI_KEY_WIRE_KEYS,
  OLLAMA_CLOUD_KEY_WIRE_KEYS,
  OPENAI_PROVIDER_WIRE_KEYS,
  OPENCODE_GO_KEY_WIRE_KEYS,
  PROVIDER_KEY_WIRE_KEYS,
} from "../provider-fields";
import { providersApi } from "../providers";
import { carryRawRecord, readRawRecord, unmodeledFields } from "../provider-raw";

const mocks = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), patch: vi.fn() }));

vi.mock("../../client/client", () => ({
  apiClient: {
    get: mocks.get,
    put: mocks.put,
    patch: mocks.patch,
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

/**
 * 面板保存渠道是整表覆盖，后端的 Replace* 不合并旧值：getter 没读进来的字段，下一次保存就没了。
 *
 * 下面每种渠道都用一条「后端结构体的每个 json 字段都填上」的记录（字段清单取自 CliRelay
 * internal/config 的 provider_keys.go、bedrock.go、vertex_compat.go，origin/dev 9c9db177f），
 * 走 读取 → 面板里改 → 整表保存，断言 PUT 的 body：
 *   没建模的字段原样在；改过的字段生效；用户清空的字段确实没了，不会被原始记录复活。
 * 「改」用 carryRawRecord({ ...loaded, ... }, loaded)，和编辑弹窗保存时一样。
 */

const MODELS = [
  { name: "upstream-a", alias: "alias-a" },
  { name: "upstream-b", alias: "alias-b" },
];
const HEADERS = { "X-Team": "ops" };

const CLAUDE = {
  id: "claude-1",
  "api-key": "sk-ant-1",
  name: "Claude Main",
  priority: 7,
  "disable-cooling": true,
  prefix: "team-a",
  "base-url": "https://claude.example/v1",
  "proxy-url": "http://proxy.example:7890",
  "proxy-id": "hk",
  models: MODELS,
  headers: HEADERS,
  "excluded-models": ["claude-opus-4"],
  cloak: {
    mode: "always",
    "strict-mode": true,
    "sensitive-words": ["secret"],
    "cache-user-id": false,
  },
  "skip-anthropic-processing": true,
};

const CODEX = {
  id: "codex-1",
  "api-key": "sk-codex-1",
  name: "Codex Main",
  priority: 5,
  "disable-cooling": false,
  prefix: "team-a",
  "base-url": "https://codex.example/v1",
  websockets: true,
  "alpha-search": true,
  "proxy-url": "http://proxy.example:7890",
  "proxy-id": "hk",
  models: MODELS,
  headers: HEADERS,
  "excluded-models": ["gpt-4"],
};

const GEMINI = {
  id: "gemini-1",
  "api-key": "gm-key-1",
  name: "Gemini Main",
  priority: 4,
  "disable-cooling": true,
  prefix: "team-a",
  "base-url": "https://gemini.example",
  "proxy-url": "http://proxy.example:7890",
  "proxy-id": "hk",
  models: MODELS,
  headers: HEADERS,
  "excluded-models": ["gemini-pro"],
};

const OPENCODE_GO = {
  id: "go-1",
  "api-key": "go-key-1",
  name: "OpenCode Go",
  disabled: true,
  priority: 3,
  "disable-cooling": true,
  prefix: "team-a",
  "proxy-url": "http://proxy.example:7890",
  "proxy-id": "hk",
  models: MODELS,
  headers: HEADERS,
  "excluded-models": ["*"],
  "vision-fallback-model": "qwen-vl",
  "codex-tool-bridge": true,
};

const CLINE = {
  id: "cline-1",
  "api-key": "cl-key-1",
  name: "ClinePass",
  disabled: true,
  priority: 2,
  "disable-cooling": false,
  prefix: "team-a",
  "base-url": "https://cline.example/api/v1",
  "proxy-url": "http://proxy.example:7890",
  "proxy-id": "hk",
  models: MODELS,
  headers: HEADERS,
  "excluded-models": ["*"],
  "vision-fallback-model": "qwen-vl",
  "auth-cookie": "session=1",
};

const OLLAMA_CLOUD = {
  ...CLINE,
  id: "ollama-1",
  "api-key": "ol-key-1",
  name: "Ollama Cloud",
  "base-url": "https://ollama.example",
};

const COMMAND_CODE = {
  id: "cc-1",
  "api-key": "cc-key-1",
  name: "Command Code",
  disabled: true,
  priority: 1,
  "disable-cooling": true,
  prefix: "team-a",
  "base-url": "https://commandcode.example/v1",
  "proxy-url": "http://proxy.example:7890",
  "proxy-id": "hk",
  models: MODELS,
  headers: HEADERS,
  "excluded-models": ["*"],
  "vision-fallback-model": "qwen-vl",
};

const VERTEX = {
  id: "vertex-1",
  "api-key": "vx-key-1",
  priority: 6,
  "disable-cooling": true,
  prefix: "team-a",
  "base-url": "https://vertex.example/api",
  "proxy-url": "http://proxy.example:7890",
  "proxy-id": "hk",
  headers: HEADERS,
  models: MODELS,
};

const BEDROCK_API_KEY = {
  id: "bedrock-1",
  name: "Bedrock API",
  priority: 8,
  "disable-cooling": true,
  prefix: "team-a",
  "auth-mode": "api-key",
  "api-key": "br-key-1",
  region: "eu-west-1",
  "force-global": true,
  "base-url": "https://bedrock.example",
  "proxy-url": "http://proxy.example:7890",
  "proxy-id": "hk",
  models: MODELS,
  headers: HEADERS,
  "excluded-models": ["claude-opus-*"],
};

const BEDROCK_SIGV4 = {
  id: "bedrock-2",
  name: "Bedrock SigV4",
  priority: 9,
  "disable-cooling": false,
  prefix: "team-a",
  "auth-mode": "sigv4",
  "access-key-id": "AKIA",
  "secret-access-key": "SECRET",
  "session-token": "SESSION",
  region: "us-east-1",
  "force-global": true,
  "base-url": "https://bedrock.example",
  "proxy-url": "http://proxy.example:7890",
  "proxy-id": "hk",
  models: MODELS,
  headers: HEADERS,
  "excluded-models": ["claude-opus-*"],
};

const OPENAI = {
  id: "openai-1",
  name: "Relay",
  disabled: true,
  priority: 3,
  "disable-cooling": true,
  prefix: "relay",
  "base-url": "https://relay.example/v1",
  "api-key-entries": [
    {
      id: "entry-1",
      "api-key": "sk-entry-1",
      disabled: true,
      "proxy-url": "http://proxy.example:7890",
      "proxy-id": "hk",
    },
    { id: "entry-2", "api-key": "sk-entry-2" },
  ],
  models: MODELS,
  headers: HEADERS,
  "codex-tool-bridge": true,
};

type Loaded = Record<string, unknown> & { apiKey?: string; name?: string };

interface Case {
  name: string;
  path: string;
  getter: string;
  load: () => Promise<Loaded[]>;
  save: (items: object[]) => Promise<unknown>;
  record: Record<string, unknown>;
  owned: readonly string[];
  /** 后端结构体里有、面板没有字段承载的 json 键。PR 描述里的核对表就是这一列。 */
  unmodeled: string[];
  /** 用户把所有可选字段都清空后编辑弹窗交出来的对象。 */
  bare: (loaded: Loaded) => object;
  bareWire: Record<string, unknown>;
}

const simpleBare = (loaded: Loaded) => ({ apiKey: loaded.apiKey });

const CASES: Case[] = [
  {
    name: "Claude",
    path: "/claude-api-key",
    getter: "getClaudeConfigs",
    load: () => providersApi.getClaudeConfigs() as unknown as Promise<Loaded[]>,
    save: (items) => providersApi.saveClaudeConfigs(items as never[]),
    record: CLAUDE,
    owned: PROVIDER_KEY_WIRE_KEYS,
    unmodeled: ["priority", "cloak"],
    bare: simpleBare,
    bareWire: { "api-key": "sk-ant-1" },
  },
  {
    name: "Codex",
    path: "/codex-api-key",
    getter: "getCodexConfigs",
    load: () => providersApi.getCodexConfigs() as unknown as Promise<Loaded[]>,
    save: (items) => providersApi.saveCodexConfigs(items as never[]),
    record: CODEX,
    owned: PROVIDER_KEY_WIRE_KEYS,
    unmodeled: ["priority", "websockets", "alpha-search"],
    bare: simpleBare,
    bareWire: { "api-key": "sk-codex-1" },
  },
  {
    name: "Gemini",
    path: "/gemini-api-key",
    getter: "getGeminiKeys",
    load: () => providersApi.getGeminiKeys() as unknown as Promise<Loaded[]>,
    save: (items) => providersApi.saveGeminiKeys(items as never[]),
    record: GEMINI,
    owned: GEMINI_KEY_WIRE_KEYS,
    unmodeled: ["priority", "proxy-url"],
    bare: simpleBare,
    bareWire: { "api-key": "gm-key-1" },
  },
  {
    name: "OpenCode Go",
    path: "/opencode-go-api-key",
    getter: "getOpenCodeGoConfigs",
    load: () => providersApi.getOpenCodeGoConfigs() as unknown as Promise<Loaded[]>,
    save: (items) => providersApi.saveOpenCodeGoConfigs(items as never[]),
    record: OPENCODE_GO,
    owned: OPENCODE_GO_KEY_WIRE_KEYS,
    unmodeled: ["priority", "codex-tool-bridge"],
    bare: simpleBare,
    bareWire: { "api-key": "go-key-1" },
  },
  {
    name: "ClinePass",
    path: "/cline-api-key",
    getter: "getClineConfigs",
    load: () => providersApi.getClineConfigs() as unknown as Promise<Loaded[]>,
    save: (items) => providersApi.saveClineConfigs(items as never[]),
    record: CLINE,
    owned: CLINE_KEY_WIRE_KEYS,
    unmodeled: ["priority"],
    bare: simpleBare,
    bareWire: { "api-key": "cl-key-1" },
  },
  {
    name: "Ollama Cloud",
    path: "/ollama-cloud-api-key",
    getter: "getOllamaCloudConfigs",
    load: () => providersApi.getOllamaCloudConfigs() as unknown as Promise<Loaded[]>,
    save: (items) => providersApi.saveOllamaCloudConfigs(items as never[]),
    record: OLLAMA_CLOUD,
    owned: OLLAMA_CLOUD_KEY_WIRE_KEYS,
    unmodeled: ["priority"],
    bare: simpleBare,
    bareWire: { "api-key": "ol-key-1" },
  },
  {
    name: "Command Code",
    path: "/commandcode-api-key",
    getter: "getCommandCodeConfigs",
    load: () => providersApi.getCommandCodeConfigs() as unknown as Promise<Loaded[]>,
    save: (items) => providersApi.saveCommandCodeConfigs(items as never[]),
    record: COMMAND_CODE,
    owned: COMMAND_CODE_KEY_WIRE_KEYS,
    unmodeled: ["priority"],
    bare: simpleBare,
    bareWire: { "api-key": "cc-key-1" },
  },
  {
    name: "Vertex",
    path: "/vertex-api-key",
    getter: "getVertexConfigs",
    load: () => providersApi.getVertexConfigs() as unknown as Promise<Loaded[]>,
    save: (items) => providersApi.saveVertexConfigs(items as never[]),
    record: VERTEX,
    owned: PROVIDER_KEY_WIRE_KEYS,
    unmodeled: ["priority"],
    bare: simpleBare,
    bareWire: { "api-key": "vx-key-1" },
  },
  {
    name: "Bedrock (api-key)",
    path: "/bedrock-api-key",
    getter: "getBedrockConfigs",
    load: () => providersApi.getBedrockConfigs() as unknown as Promise<Loaded[]>,
    save: (items) => providersApi.saveBedrockConfigs(items as never[]),
    record: BEDROCK_API_KEY,
    owned: BEDROCK_KEY_WIRE_KEYS,
    unmodeled: ["priority"],
    bare: (loaded) => ({ authMode: "api-key", apiKey: loaded.apiKey }),
    bareWire: { "auth-mode": "api-key", "api-key": "br-key-1" },
  },
  {
    name: "Bedrock (SigV4)",
    path: "/bedrock-api-key",
    getter: "getBedrockConfigs",
    load: () => providersApi.getBedrockConfigs() as unknown as Promise<Loaded[]>,
    save: (items) => providersApi.saveBedrockConfigs(items as never[]),
    record: BEDROCK_SIGV4,
    owned: BEDROCK_KEY_WIRE_KEYS,
    unmodeled: ["priority"],
    bare: (loaded) => ({ authMode: "sigv4", apiKey: loaded.apiKey, accessKeyId: loaded.apiKey }),
    bareWire: { "auth-mode": "sigv4", "access-key-id": "AKIA" },
  },
  {
    name: "OpenAI compatible",
    path: "/openai-compatibility",
    getter: "getOpenAIProviders",
    load: () => providersApi.getOpenAIProviders() as unknown as Promise<Loaded[]>,
    save: (items) => providersApi.saveOpenAIProviders(items as never[]),
    record: OPENAI,
    owned: OPENAI_PROVIDER_WIRE_KEYS,
    unmodeled: ["codex-tool-bridge"],
    bare: (loaded) => ({ name: loaded.name }),
    bareWire: { name: "Relay" },
  },
];

const pick = (record: Record<string, unknown>, keys: string[]) =>
  Object.fromEntries(keys.map((key) => [key, record[key]]));

const lastPut = () => {
  const call = mocks.put.mock.calls.at(-1);
  return { path: call?.[0] as string, body: call?.[1] as Record<string, unknown>[] };
};

const respondWith = (c: Case, records: Record<string, unknown>[]) =>
  mocks.get.mockResolvedValue({
    [c.path.slice(1)]: records,
    capabilities: { "disable-cooling": true },
  });

beforeEach(() => {
  mocks.get.mockReset();
  mocks.put.mockReset();
  mocks.patch.mockReset();
  mocks.put.mockResolvedValue({});
  mocks.patch.mockResolvedValue({});
});

describe("backend fields the panel has no input for survive a whole-list save", () => {
  test("every list getter on providersApi is covered by a case", () => {
    const getters = Object.keys(providersApi).filter((name) => /^get[A-Z]/.test(name));
    expect([...new Set(CASES.map((c) => c.getter))].sort()).toEqual(getters.sort());
  });

  test.each(CASES)("$name: the unmodeled column matches the owned-key list", (c) => {
    expect(Object.keys(unmodeledFields(c.record, c.owned)).sort()).toEqual([...c.unmodeled].sort());
  });

  test.each(CASES)(
    "$name: loading and saving without edits writes back what the backend sent",
    async (c) => {
      respondWith(c, [c.record]);

      await c.save(await c.load());

      const { path, body } = lastPut();
      expect(path).toBe(c.path);
      expect(body).toEqual([c.record]);
    },
  );

  test.each(CASES)("$name: an edit takes effect and the unmodeled fields stay", async (c) => {
    respondWith(c, [c.record]);
    const [loaded] = await c.load();

    await c.save([carryRawRecord({ ...loaded, prefix: "edited" }, loaded)]);

    const [sent] = lastPut().body;
    expect(sent).toEqual({ ...c.record, prefix: "edited" });
    expect(pick(sent, c.unmodeled)).toEqual(pick(c.record, c.unmodeled));
  });

  test.each(CASES)(
    "$name: fields the user cleared are gone, not revived from the backend record",
    async (c) => {
      respondWith(c, [c.record]);
      const [loaded] = await c.load();

      await c.save([carryRawRecord(c.bare(loaded), loaded)]);

      const [sent] = lastPut().body;
      expect(sent).toEqual({ ...c.bareWire, ...pick(c.record, c.unmodeled) });
      for (const key of Object.keys(c.record)) {
        if (c.unmodeled.includes(key) || key in c.bareWire) continue;
        expect(sent).not.toHaveProperty(key);
      }
    },
  );

  test.each(CASES)(
    "$name: a channel created in the panel is written from its modeled fields only",
    async (c) => {
      respondWith(c, [c.record]);
      const [loaded] = await c.load();

      // 没有 carryRawRecord：新建渠道没有后端记录可带。
      await c.save([c.bare(loaded)]);

      expect(lastPut().body).toEqual([c.bareWire]);
    },
  );

  test.each(CASES)("$name: each channel keeps its own record, not its neighbour's", async (c) => {
    const neighbour = structuredClone(c.record);
    neighbour.id = "neighbour";
    for (const key of c.unmodeled) neighbour[key] = { marker: `neighbour ${key}` };
    respondWith(c, [c.record, neighbour]);
    const [first, second] = await c.load();

    // 只编辑第一条，第二条原样交回去。
    await c.save([carryRawRecord({ ...first, prefix: "edited" }, first), second]);

    const [sentFirst, sentSecond] = lastPut().body;
    expect(pick(sentFirst, c.unmodeled)).toEqual(pick(c.record, c.unmodeled));
    expect(pick(sentSecond, c.unmodeled)).toEqual(pick(neighbour, c.unmodeled));
  });
});

describe("single-entry PATCH leaves the unmodeled fields to the backend", () => {
  test.each([
    {
      name: "OpenCode Go",
      load: () => providersApi.getOpenCodeGoConfigs(),
      patch: (item: never) => providersApi.patchOpenCodeGoConfig(0, item),
      record: OPENCODE_GO,
      path: "/opencode-go-api-key",
    },
    {
      name: "ClinePass",
      load: () => providersApi.getClineConfigs(),
      patch: (item: never) => providersApi.patchClineConfig(0, item),
      record: CLINE,
      path: "/cline-api-key",
    },
    {
      name: "Ollama Cloud",
      load: () => providersApi.getOllamaCloudConfigs(),
      patch: (item: never) => providersApi.patchOllamaCloudConfig(0, item),
      record: OLLAMA_CLOUD,
      path: "/ollama-cloud-api-key",
    },
    {
      name: "Command Code",
      load: () => providersApi.getCommandCodeConfigs(),
      patch: (item: never) => providersApi.patchCommandCodeConfig(0, item),
      record: COMMAND_CODE,
      path: "/commandcode-api-key",
    },
  ])("$name patch body carries modeled fields only", async ({ load, patch, record, path }) => {
    mocks.get.mockResolvedValue({ [path.slice(1)]: [record] });
    const [loaded] = await load();

    await patch(carryRawRecord({ ...loaded, prefix: "edited" }, loaded) as never);

    // PATCH 里没写的键后端会保留原值；把读到的旧值再发一遍只会盖掉别人刚改的。
    const value = mocks.patch.mock.calls[0]?.[1].value as Record<string, unknown>;
    expect(value.prefix).toBe("edited");
    expect(value).not.toHaveProperty("priority");
    expect(value).not.toHaveProperty("codex-tool-bridge");
  });
});

describe("nested records", () => {
  test("a model entry keeps its own unknown fields, matched by name and alias", async () => {
    mocks.get.mockResolvedValue({
      "gemini-api-key": [
        {
          "api-key": "k",
          models: [
            { name: "a", alias: "a-1", thinking: { budget: 1024 } },
            { name: "a", alias: "a-2", region: "eu" },
            { name: "b", alias: "b-1", future: true },
          ],
        },
      ],
    });
    const [loaded] = await providersApi.getGeminiKeys();

    // 改了第二个 a 的别名、删了 b、新增 c。
    await providersApi.saveGeminiKeys([
      carryRawRecord(
        {
          ...loaded,
          models: [
            { name: "a", alias: "a-1" },
            { name: "a", alias: "a-3" },
            { name: "c", alias: "c-1" },
          ],
        },
        loaded,
      ) as never,
    ]);

    expect(lastPut().body[0].models).toEqual([
      { name: "a", alias: "a-1", thinking: { budget: 1024 } },
      { name: "a", alias: "a-3", region: "eu" },
      { name: "c", alias: "c-1" },
    ]);
  });

  test("an alias the user cleared does not come back with the model's other fields", async () => {
    mocks.get.mockResolvedValue({
      "claude-api-key": [
        { "api-key": "k", models: [{ name: "claude-sonnet-4", alias: "sonnet", future: 1 }] },
      ],
    });
    const [loaded] = await providersApi.getClaudeConfigs();

    await providersApi.saveClaudeConfigs([
      carryRawRecord({ ...loaded, models: [{ name: "claude-sonnet-4" }] }, loaded) as never,
    ]);

    expect(lastPut().body[0].models).toEqual([{ name: "claude-sonnet-4", future: 1 }]);
  });

  test("an API key entry keeps its own unknown fields across a key rotation, matched by id", async () => {
    mocks.get.mockResolvedValue({
      "openai-compatibility": [
        {
          name: "Relay",
          "base-url": "https://relay.example/v1",
          "api-key-entries": [
            { id: "e1", "api-key": "k1", weight: 5, "proxy-url": "http://old.example:1" },
            { id: "e2", "api-key": "k2", weight: 9 },
          ],
        },
      ],
    });
    const [loaded] = await providersApi.getOpenAIProviders();

    // e1 换了 key、清掉了代理；e2 被删；新增 k3。
    await providersApi.saveOpenAIProviders([
      carryRawRecord(
        { ...loaded, apiKeyEntries: [{ id: "e1", apiKey: "k1-rotated" }, { apiKey: "k3" }] },
        loaded,
      ) as never,
    ]);

    expect(lastPut().body[0]["api-key-entries"]).toEqual([
      { id: "e1", "api-key": "k1-rotated", weight: 5 },
      { "api-key": "k3" },
    ]);
  });

  test("entries from a backend without stable ids are matched by api-key", async () => {
    mocks.get.mockResolvedValue({
      "openai-compatibility": [
        {
          name: "Relay",
          "base-url": "https://relay.example/v1",
          "api-key-entries": [{ "api-key": "k1", weight: 5 }],
        },
      ],
    });
    const [loaded] = await providersApi.getOpenAIProviders();

    await providersApi.saveOpenAIProviders([
      carryRawRecord(
        { ...loaded, apiKeyEntries: [{ apiKey: "k1", disabled: true }] },
        loaded,
      ) as never,
    ]);

    expect(lastPut().body[0]["api-key-entries"]).toEqual([
      { "api-key": "k1", disabled: true, weight: 5 },
    ]);
  });
});

describe("Bedrock credentials", () => {
  test("switching to SigV4 does not carry the old bearer key along", async () => {
    mocks.get.mockResolvedValue({ "bedrock-api-key": [BEDROCK_API_KEY] });
    const [loaded] = await providersApi.getBedrockConfigs();

    await providersApi.saveBedrockConfigs([
      carryRawRecord(
        {
          ...loaded,
          authMode: "sigv4" as const,
          accessKeyId: "AKIA",
          secretAccessKey: "SECRET",
        },
        loaded,
      ),
    ]);

    const [sent] = lastPut().body;
    expect(sent).not.toHaveProperty("api-key");
    expect(sent).toMatchObject({
      "auth-mode": "sigv4",
      "access-key-id": "AKIA",
      "secret-access-key": "SECRET",
      priority: 8,
    });
  });
});

describe("how the backend record rides on a model", () => {
  const load = async () => {
    mocks.get.mockResolvedValue({ "claude-api-key": [structuredClone(CLAUDE)] });
    return (await providersApi.getClaudeConfigs())[0];
  };

  test("it is invisible to serialization and comparison", async () => {
    const loaded = await load();

    expect(readRawRecord(loaded)).toEqual(CLAUDE);
    expect(Object.keys(loaded)).not.toContain("cloak");
    expect(JSON.stringify(loaded)).not.toContain("cloak");
    expect(JSON.stringify(loaded)).not.toContain("priority");
    expect(loaded).toEqual({ ...loaded });
    expect(loaded).toStrictEqual({ ...loaded });
  });

  test("it does not survive a spread, so the places that rebuild an item must carry it", async () => {
    const loaded = await load();

    expect(readRawRecord({ ...loaded })).toBeUndefined();
    expect(readRawRecord(carryRawRecord({ ...loaded }, loaded))).toEqual(CLAUDE);
    expect(
      readRawRecord(carryRawRecord({ ...loaded }, { apiKey: "never loaded" })),
    ).toBeUndefined();
  });

  test("it is a private copy: neither the response nor the request body alias it", async () => {
    const response = { "claude-api-key": [structuredClone(CLAUDE)] };
    mocks.get.mockResolvedValue(response);
    const [loaded] = await providersApi.getClaudeConfigs();

    response["claude-api-key"][0].priority = 99;
    response["claude-api-key"][0].cloak.mode = "never";
    await providersApi.saveClaudeConfigs([loaded]);
    const first = lastPut().body[0];
    expect(first).toMatchObject({ priority: 7, cloak: { mode: "always" } });

    (first.cloak as { mode: string }).mode = "tampered";
    await providersApi.saveClaudeConfigs([loaded]);
    expect(lastPut().body[0]).toMatchObject({ cloak: { mode: "always" } });
  });

  test("carrying onto a frozen object leaves it alone instead of throwing", async () => {
    const loaded = await load();
    const frozen = Object.freeze({ apiKey: "k" });

    expect(() => carryRawRecord(frozen, loaded)).not.toThrow();
    expect(readRawRecord(frozen)).toBeUndefined();
  });
});
