import { beforeEach, describe, expect, test, vi } from "vitest";

const getMock = vi.fn();
const putMock = vi.fn();
const patchMock = vi.fn();

vi.mock("../../client/client", () => ({
  apiClient: { get: getMock, put: putMock, patch: patchMock, post: vi.fn(), delete: vi.fn() },
}));

type ProvidersApi = (typeof import("../providers"))["providersApi"];

// Every provider list, with the smallest entry its getter keeps. The panel saves a
// list by replacing it whole, so a field the getter drops is wiped on the next save.
const LISTS: {
  key: string;
  get: (api: ProvidersApi) => Promise<Array<{ disableCooling?: boolean }>>;
  save: (api: ProvidersApi, items: never[]) => Promise<unknown>;
  entry: Record<string, unknown>;
}[] = [
  {
    key: "gemini-api-key",
    get: (a) => a.getGeminiKeys(),
    save: (a, i) => a.saveGeminiKeys(i),
    entry: { "api-key": "k" },
  },
  {
    key: "claude-api-key",
    get: (a) => a.getClaudeConfigs(),
    save: (a, i) => a.saveClaudeConfigs(i),
    entry: { "api-key": "k" },
  },
  {
    key: "codex-api-key",
    get: (a) => a.getCodexConfigs(),
    save: (a, i) => a.saveCodexConfigs(i),
    entry: { "api-key": "k" },
  },
  {
    key: "opencode-go-api-key",
    get: (a) => a.getOpenCodeGoConfigs(),
    save: (a, i) => a.saveOpenCodeGoConfigs(i),
    entry: { "api-key": "k" },
  },
  {
    key: "cline-api-key",
    get: (a) => a.getClineConfigs(),
    save: (a, i) => a.saveClineConfigs(i),
    entry: { "api-key": "k" },
  },
  {
    key: "ollama-cloud-api-key",
    get: (a) => a.getOllamaCloudConfigs(),
    save: (a, i) => a.saveOllamaCloudConfigs(i),
    entry: { "api-key": "k" },
  },
  {
    key: "commandcode-api-key",
    get: (a) => a.getCommandCodeConfigs(),
    save: (a, i) => a.saveCommandCodeConfigs(i),
    entry: { "api-key": "k" },
  },
  {
    key: "vertex-api-key",
    get: (a) => a.getVertexConfigs(),
    save: (a, i) => a.saveVertexConfigs(i),
    entry: { "api-key": "k", "base-url": "https://vertex.example" },
  },
  {
    key: "bedrock-api-key",
    get: (a) => a.getBedrockConfigs(),
    save: (a, i) => a.saveBedrockConfigs(i),
    entry: { "auth-mode": "api-key", "api-key": "k", region: "us-east-1" },
  },
  {
    key: "openai-compatibility",
    get: (a) => a.getOpenAIProviders(),
    save: (a, i) => a.saveOpenAIProviders(i),
    entry: { name: "relay", "base-url": "https://relay.example/v1" },
  },
];

describe("channel cooling override", () => {
  beforeEach(() => {
    getMock.mockReset();
    putMock.mockReset();
    patchMock.mockReset();
    putMock.mockResolvedValue({});
    patchMock.mockResolvedValue({});
  });

  test.each(LISTS)("$key keeps the override through a load and a whole-list save", async (list) => {
    const { providersApi } = await import("../providers");
    getMock.mockResolvedValue({
      [list.key]: [
        { ...list.entry, "disable-cooling": true },
        { ...list.entry, "disable-cooling": false },
        { ...list.entry },
      ],
      capabilities: { "disable-cooling": true },
    });

    const loaded = await list.get(providersApi);
    expect(loaded.map((item) => item.disableCooling)).toEqual([true, false, undefined]);

    await list.save(providersApi, loaded as never[]);
    const sent = putMock.mock.calls[0]?.[1] as Record<string, unknown>[];
    expect(sent.map((item) => item["disable-cooling"])).toEqual([true, false, undefined]);
    expect(sent[2]).not.toHaveProperty("disable-cooling");
  });

  test("single-entry patches send null for an inherited override so the backend clears it", async () => {
    const { providersApi } = await import("../providers");
    await providersApi.patchCommandCodeConfig(0, { apiKey: "", name: "relay" });
    await providersApi.patchClineConfig(1, { apiKey: "", name: "cline", disableCooling: true });
    await providersApi.patchOllamaCloudConfig(2, {
      apiKey: "",
      name: "ollama",
      disableCooling: false,
    });
    await providersApi.patchOpenCodeGoConfig(3, { apiKey: "", name: "go" });

    const sent = patchMock.mock.calls.map(
      ([, body]) => (body as { value: Record<string, unknown> }).value["disable-cooling"],
    );
    expect(sent).toEqual([null, true, false, null]);
  });

  test("remembers whether the backend can store the override", async () => {
    const { providersApi } = await import("../providers");
    const {
      isChannelCoolingSupported,
      rememberChannelCoolingSupport,
      subscribeChannelCoolingSupport,
    } = await import("../channel-cooling");
    rememberChannelCoolingSupport(null);
    const listener = vi.fn();
    const unsubscribe = subscribeChannelCoolingSupport(listener);

    getMock.mockResolvedValue({ "claude-api-key": [], capabilities: { "disable-cooling": true } });
    await providersApi.getClaudeConfigs();
    expect(isChannelCoolingSupported()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);

    // Same answer again: nothing to tell.
    await providersApi.getCodexConfigs();
    expect(listener).toHaveBeenCalledTimes(1);

    // An older backend answers without the declaration.
    getMock.mockResolvedValue({ "codex-api-key": [] });
    await providersApi.getCodexConfigs();
    expect(isChannelCoolingSupported()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    getMock.mockResolvedValue({ "codex-api-key": [], capabilities: { "disable-cooling": true } });
    await providersApi.getCodexConfigs();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
