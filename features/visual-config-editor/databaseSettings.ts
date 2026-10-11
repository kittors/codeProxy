import type { VisualConfigValues } from "./types";

/**
 * 服务端正在使用的配置。`config` 是 GET /config：凭据已脱敏，全局代理只剩协议和主机，
 * 不能拿来回显或回写；代理原文另从 GET /proxy-url 取，放在 `proxyUrl`。
 */
export interface LiveConfig {
  config: Record<string, unknown>;
  proxyUrl: string;
}

/**
 * 配置页上存在数据库（runtime_settings）里、不在 config.yaml 里的设置，以及各自对应的表单值。
 *
 * CliRelay 从 68ed2258（2026-09-25）起把这些设置存进数据库、整个集群共用：PUT /config.yaml
 * 会把文件里写出来的这些键存进数据库，随即从文件里删掉。所以——
 * - 读：config.yaml 里永远没有它们，当前值要从运行中的配置（LiveConfig）取；
 * - 写：后端只认文件里写出来的键，没写的不动。改过的要明确写进去（关掉开关也要写 false），
 *   没改的不能写——写了会拿页面打开时的旧值，盖掉别人在这期间做的修改。
 * 键名与 CliRelay internal/management/settings/runtimeconfig 的 spec.go、spec_general.go 一致；
 * 后端把配置页上更多的设置挪进数据库时，这里要一起加。
 */
const DATABASE_SETTINGS = {
  "proxy-url": (v) => v.proxyUrl,
  "request-retry": (v) => v.requestRetry,
  "max-retry-interval": (v) => v.maxRetryInterval,
  "force-model-prefix": (v) => v.forceModelPrefix,
  "ws-auth": (v) => v.wsAuth,
  "quota-exceeded": (v) => [v.quotaSwitchProject, v.quotaSwitchPreviewModel],
  debug: (v) => v.debug,
  "request-log": (v) => v.requestLog,
  "request-log-storage": (v) => v.requestLogStorage,
  "logging-to-file": (v) => v.loggingToFile,
  "logs-max-total-size-mb": (v) => v.logsMaxTotalSizeMb,
  "error-logs-max-files": (v) => v.errorLogsMaxFiles,
  "usage-statistics-enabled": (v) => v.usageStatisticsEnabled,
  "kimi-header-defaults": (v) => v.kimiHeaderDefaults,
  payload: (v) => [v.payloadDefaultRules, v.payloadOverrideRules, v.payloadFilterRules],
} satisfies Record<string, (values: VisualConfigValues) => unknown>;

type DatabaseSettingKey = keyof typeof DATABASE_SETTINGS;

const DATABASE_SETTING_KEYS = Object.keys(DATABASE_SETTINGS) as DatabaseSettingKey[];

/**
 * request-log-storage 的整数在后端是 omitempty：GET /config 里缺的那几项就是 0（保留天数、
 * 行数、体积上限的 0 表示「不限」）。不补成 0 的话页面会显示默认上限，保存时把「不限」悄悄改掉。
 */
const STORAGE_INTEGER_KEYS = [
  "retention-days",
  "content-retention-days",
  "cleanup-interval-minutes",
  "cleanup-batch-size",
  "cleanup-max-runtime-seconds",
  "max-rows",
  "max-metadata-size-mb",
  "max-total-size-mb",
];

function hasKey(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** 设置项（YAML 键，子项写成 `request-log-storage.max-rows`）是否存在数据库里。 */
export function isDatabaseSetting(yamlKey: string): boolean {
  return hasKey(DATABASE_SETTINGS, yamlKey.split(".")[0] ?? "");
}

function liveValue(live: LiveConfig, key: DatabaseSettingKey): unknown {
  // GET /config 里的代理去掉了账号密码，拿它回显再保存会把凭据弄丢。
  if (key === "proxy-url") return live.proxyUrl;
  const value = live.config[key];
  if (value === undefined || value === null) return undefined;
  // 拷一份：表单在 doc 上就地改嵌套对象，不能改到 live 本身。值来自 JSON 响应，JSON 往返是精确的。
  const copy: unknown = JSON.parse(JSON.stringify(value));
  if (key === "request-log-storage" && isRecord(copy)) {
    for (const field of STORAGE_INTEGER_KEYS) if (!hasKey(copy, field)) copy[field] = 0;
  }
  return copy;
}

/**
 * 页面眼里的 config.yaml：文件内容，加上存在数据库里的那些设置的当前值。
 * 文件里写着的键优先——源码页里还没保存的改动就在文件文本里，切回可视化页时不能被当前值盖掉。
 * 没读到 live 时就是文件本身。
 */
export function effectiveConfigDocument(
  yamlDoc: Record<string, unknown>,
  live: LiveConfig | null,
): Record<string, unknown> {
  const doc = { ...yamlDoc };
  if (!live) return doc;
  for (const key of DATABASE_SETTING_KEYS) {
    if (hasKey(doc, key)) continue;
    const value = liveValue(live, key);
    if (value !== undefined) doc[key] = value;
  }
  return doc;
}

/**
 * 保存前收尾：存在数据库里的设置只留下这次改过的（调用方已把它们明确写进 doc），
 * 没改的恢复成文件原样——文件里本来没有就不写。
 */
export function keepChangedDatabaseSettings(
  doc: Record<string, unknown>,
  original: Record<string, unknown>,
  values: VisualConfigValues,
  baseline: VisualConfigValues,
): void {
  for (const key of DATABASE_SETTING_KEYS) {
    const pick = DATABASE_SETTINGS[key];
    if (JSON.stringify(pick(values)) !== JSON.stringify(pick(baseline))) continue;
    if (hasKey(original, key)) doc[key] = original[key];
    else delete doc[key];
  }
}

/**
 * 存在数据库里的整数设置。清空时写 null：后端读到 null 按「文件里没写这个值」取默认值，
 * 但这个键仍算写出来了，默认值会存进数据库；直接删掉键的话，后端不会动数据库里的旧值。
 */
export function databaseInteger(text: string): number | null {
  const trimmed = text.trim();
  return /^-?\d+$/.test(trimmed) ? Number.parseInt(trimmed, 10) : null;
}
