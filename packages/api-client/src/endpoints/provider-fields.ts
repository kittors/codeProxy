import type { NestedListSpec, RawRecord, RecordIdentity } from "./provider-raw";

/**
 * 每个 serializer「自己负责」的键，也就是它可能写进请求体的全部键。
 *
 * 序列化时以后端原始记录为底，先删掉这里列出的键，再写入建模字段（见 provider-raw.ts）。所以：
 * - 清单里有而 serializer 没写出来的键（用户清空了的字段）会被删掉，不会被旧值复活；
 * - 清单里没有的键，说明面板没有字段承载它，原样回写。
 *
 * 新增 serializer 写出的键时必须同步加到这里；`__tests__/provider-fields.test.ts` 用「所有字段都填满」的对象
 * 序列化，要求输出的键集合与清单完全一致，漏记或多记都会挂。
 */

/** `serializeModels` 写出的模型项。 */
export const MODEL_WIRE_KEYS = ["name", "alias", "priority", "test-model"] as const;

/** OpenAI 兼容供应商 `api-key-entries` 里的一项。 */
export const API_KEY_ENTRY_WIRE_KEYS = [
  "id",
  "api-key",
  "disabled",
  "proxy-url",
  "proxy-id",
  "headers",
] as const;

/** `serializeProviderKey`：Claude、Codex、Vertex 共用。 */
export const PROVIDER_KEY_WIRE_KEYS = [
  "api-key",
  "id",
  "name",
  "prefix",
  "base-url",
  "proxy-url",
  "proxy-id",
  "headers",
  "models",
  "excluded-models",
  "vision-fallback-model",
  "skip-anthropic-processing",
  "disable-cooling",
] as const;

export const GEMINI_KEY_WIRE_KEYS = [
  "api-key",
  "id",
  "name",
  "prefix",
  "base-url",
  "proxy-id",
  "headers",
  "models",
  "excluded-models",
  "disable-cooling",
] as const;

export const OPENCODE_GO_KEY_WIRE_KEYS = [
  "id",
  "api-key",
  "disabled",
  "name",
  "prefix",
  "proxy-url",
  "proxy-id",
  "headers",
  "models",
  "excluded-models",
  "vision-fallback-model",
  "disable-cooling",
] as const;

export const CLINE_KEY_WIRE_KEYS = [
  "id",
  "api-key",
  "disabled",
  "name",
  "prefix",
  "base-url",
  "proxy-url",
  "proxy-id",
  "headers",
  "models",
  "excluded-models",
  "vision-fallback-model",
  "auth-cookie",
  "disable-cooling",
] as const;

export const OLLAMA_CLOUD_KEY_WIRE_KEYS = [
  "id",
  "api-key",
  "disabled",
  "name",
  "prefix",
  "base-url",
  "proxy-url",
  "proxy-id",
  "headers",
  "models",
  "excluded-models",
  "vision-fallback-model",
  "auth-cookie",
  "disable-cooling",
] as const;

export const COMMAND_CODE_KEY_WIRE_KEYS = [
  "id",
  "api-key",
  "disabled",
  "name",
  "prefix",
  "base-url",
  "proxy-url",
  "proxy-id",
  "headers",
  "models",
  "excluded-models",
  "vision-fallback-model",
  "disable-cooling",
] as const;

/** `serializeBedrockKey`：api-key 与 SigV4 两种认证方式写的凭据键都算。 */
export const BEDROCK_KEY_WIRE_KEYS = [
  "auth-mode",
  "id",
  "name",
  "prefix",
  "region",
  "force-global",
  "base-url",
  "proxy-url",
  "proxy-id",
  "headers",
  "models",
  "excluded-models",
  "api-key",
  "access-key-id",
  "secret-access-key",
  "session-token",
  "disable-cooling",
] as const;

export const OPENAI_PROVIDER_WIRE_KEYS = [
  "name",
  "id",
  "disabled",
  "base-url",
  "prefix",
  "headers",
  "models",
  "priority",
  "test-model",
  "api-key-entries",
  "disable-cooling",
] as const;

const text = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const modelName = (record: RawRecord) => text(record.name ?? record.id);

// 同一个上游模型名可以配多个别名，所以先按「名字 + 别名」认，认不出再只按名字认
// （用户刚改了别名时），别名等于名字和没有别名是一回事。
const modelByNameAndAlias: RecordIdentity = (record) => {
  const name = modelName(record);
  if (!name) return undefined;
  const alias = text(record.alias);
  return `${name}\u0000${alias && alias !== name ? alias : ""}`;
};
const modelByName: RecordIdentity = modelName;

// 条目的稳定 id 优先；后端还没发 id 的旧版本退回按 api-key 认。
const entryById: RecordIdentity = (record) => text(record.id);
const entryByApiKey: RecordIdentity = (record) => text(record["api-key"] ?? record.apiKey);

/** serializer 写出的嵌套列表，原始记录里同一列表的对应项要一起合并。 */
export const PROVIDER_NESTED_LISTS: readonly NestedListSpec[] = [
  { key: "models", owned: MODEL_WIRE_KEYS, identities: [modelByNameAndAlias, modelByName] },
  {
    key: "api-key-entries",
    owned: API_KEY_ENTRY_WIRE_KEYS,
    identities: [entryById, entryByApiKey],
  },
];
