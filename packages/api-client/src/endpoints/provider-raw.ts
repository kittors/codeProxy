/**
 * 渠道记录里面板没有字段承载的那部分，以及怎么让它们活过一次整表保存。
 *
 * 面板保存渠道是整表覆盖（`PUT /<provider>-api-key`、`PUT /openai-compatibility`），后端的 Replace*
 * 不会和旧值合并，所以后端有、面板没建模的字段（Key 级 priority、cloak、alpha-search、
 * codex-tool-bridge……）只要经过一次面板保存就会被清掉。
 *
 * 做法：getter 把后端返回的**原始记录**挂在读出的模型对象上；serializer 以它为底，先去掉自己负责的键，
 * 再写入建模字段。于是没建模的字段原样回写，而用户在界面上清空的建模字段不会被旧值复活。
 *
 * 为什么是「不可枚举的 Symbol 属性」：
 * - JSON.stringify、Object.keys/entries、toEqual/toStrictEqual 都看不见它，不会被意外写进请求体、
 *   localStorage 缓存，也不会让只比较建模字段的现有比较和测试失灵；可枚举的 Symbol 属性会被 toEqual
 *   比较到，普通字符串键则会被序列化，都不行。
 * - 用 `Symbol.for` 而不是模块私有 Symbol，同一份代码被打包两次时两边仍认同一个键。
 * - 对象展开 `{ ...item }`、structuredClone、JSON 往返都不会带上它。这是有意的：凡是「从旧对象造新对象」的
 *   地方必须显式 carryRawRecord；漏接时退化成「只写建模字段」（修复前的行为），而不是把别的记录的原始值串进来。
 *   缓存是 JSON，所以 pages/providers/provider-cache.ts 把它另存为普通字段再还原。
 */

export type RawRecord = Record<string, unknown>;

const RAW_RECORD = Symbol.for("code-proxy.provider-raw-record");

const isRecord = (value: unknown): value is RawRecord =>
  value !== null && typeof value === "object" && !Array.isArray(value);

// 原始记录来自 JSON 响应，只含纯数据；拷一份是为了不和响应对象、也不和请求体共享引用。
const cloneValue = <T>(value: T): T => {
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value)) as T;
  }
};

const hide = (target: object, raw: RawRecord): void => {
  // 冻结/封闭过的对象写不进去，宁可退化成「只写建模字段」，也不要让保存流程抛异常。
  if (!Object.isExtensible(target)) return;
  Object.defineProperty(target, RAW_RECORD, {
    value: raw,
    enumerable: false,
    writable: true,
    configurable: true,
  });
};

/** 对象上挂着的后端原始记录；新建的、从缓存还原不出的对象没有。 */
export const readRawRecord = (source: unknown): RawRecord | undefined => {
  if (source === null || typeof source !== "object") return undefined;
  const raw = (source as Record<symbol, unknown>)[RAW_RECORD];
  return isRecord(raw) ? raw : undefined;
};

/** getter 用：把后端返回的这条记录存一份挂到读出的模型对象上，返回同一个模型对象。 */
export const withRawRecord = <T extends object>(source: unknown, model: T): T => {
  if (isRecord(source)) hide(model, cloneValue(source));
  return model;
};

/**
 * 「从旧对象造新对象」的地方用（表单提交后替换列表项、`{ ...item, disabled }` 之类）：
 * 把旧对象上的原始记录接到新对象上。新建渠道没有原始记录，什么都不会发生。
 */
export const carryRawRecord = <T extends object>(next: T, from: unknown): T => {
  const raw = readRawRecord(from);
  if (raw) hide(next, raw);
  return next;
};

const camelCase = (key: string): string =>
  key.replace(/-([a-z0-9])/g, (_match, ch: string) => ch.toUpperCase());

// 面板的归一化函数同时认 kebab-case 和 camelCase（手写导入文件常见后者），负责的键两种写法都算。
const isOwned = (owned: readonly string[], key: string): boolean =>
  owned.some((ownedKey) => ownedKey === key || camelCase(ownedKey) === key);

/** 原始记录里面板不负责的键。 */
export const unmodeledFields = (raw: RawRecord, owned: readonly string[]): RawRecord => {
  const extras: RawRecord = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!isOwned(owned, key)) extras[key] = value;
  }
  return extras;
};

const mergeRecord = (modeled: RawRecord, raw: RawRecord, owned: readonly string[]): RawRecord => {
  const extras = unmodeledFields(raw, owned);
  const names = Object.keys(extras);
  if (names.length === 0) return modeled;
  const merged: RawRecord = { ...modeled };
  for (const key of names) {
    // 建模字段永远优先。清单漏记一个键时，宁可少回写一个旧值，也不能盖掉用户刚改的；
    // 清单是否齐全由 provider-fields.test.ts 强制。
    if (!(key in merged)) merged[key] = cloneValue(extras[key]);
  }
  return merged;
};

/** 嵌套列表（models、api-key-entries）里的一项在原始记录里对应哪一项。按顺序尝试，先中先得。 */
export type RecordIdentity = (record: RawRecord) => string | undefined;

export interface NestedListSpec {
  /** payload 里的键，例如 `models`。 */
  key: string;
  /** 列表项里 serializer 负责的键。 */
  owned: readonly string[];
  identities: readonly RecordIdentity[];
}

const mergeList = (
  modeled: readonly unknown[],
  rawList: unknown,
  spec: NestedListSpec,
): unknown[] => {
  const pool = Array.isArray(rawList) ? rawList.filter(isRecord) : [];
  if (pool.length === 0) return [...modeled];
  const taken = new Set<number>();
  return modeled.map((item) => {
    if (!isRecord(item)) return item;
    for (const identity of spec.identities) {
      const wanted = identity(item);
      if (wanted === undefined) continue;
      const at = pool.findIndex(
        (candidate, index) => !taken.has(index) && identity(candidate) === wanted,
      );
      if (at === -1) continue;
      taken.add(at);
      return mergeRecord(item, pool[at], spec.owned);
    }
    // 新增的项没有原始记录，只写建模字段。
    return item;
  });
};

/**
 * serializer 的最后一步：以 `source` 上挂的原始记录为底，去掉 `owned` 里的键，再叠上 `payload`。
 * `source` 没有原始记录（新建渠道、旧调用方）时原样返回 payload。
 */
export const mergeUnmodeledRecord = (
  payload: RawRecord,
  source: unknown,
  owned: readonly string[],
  nested: readonly NestedListSpec[] = [],
): RawRecord => {
  const raw = readRawRecord(source);
  if (!raw) return payload;
  let base = payload;
  for (const spec of nested) {
    const list = payload[spec.key];
    if (Array.isArray(list)) {
      base = { ...base, [spec.key]: mergeList(list, raw[spec.key], spec) };
    }
  }
  return mergeRecord(base, raw, owned);
};
