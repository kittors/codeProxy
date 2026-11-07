/**
 * 冷却开关在表单里的取值。后端字段叫 disable-cooling（true = 关闭冷却），名字是反的，表单里换成
 * 正向说法，免得出现「开启禁用」这种双重否定：
 * - ""：跟随全局设置，不写这个字段
 * - "off"：关闭冷却（disable-cooling: true），回 429/5xx 也不停用，下一个请求照常发过去
 * - "on"：开启冷却（disable-cooling: false），即使全局关了冷却也照常冷却
 */
export type CoolingMode = "" | "off" | "on";

export const coolingModeFromOverride = (disableCooling: boolean | undefined): CoolingMode =>
  disableCooling === true ? "off" : disableCooling === false ? "on" : "";

export const coolingOverrideFromMode = (mode: CoolingMode): boolean | undefined =>
  mode === "off" ? true : mode === "on" ? false : undefined;

/** 展开进渠道配置对象用：跟随全局时不带这个键。 */
export const coolingOverrideField = (mode: CoolingMode): { disableCooling?: boolean } => {
  const value = coolingOverrideFromMode(mode);
  return value === undefined ? {} : { disableCooling: value };
};

/** 和后端 parseBoolAny 读法一致：布尔、"true"/"false"/"1"/"0" 这类字符串、非零数字。读不懂就当没写。 */
const parseOverride = (raw: unknown): boolean | undefined => {
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw !== 0 : undefined;
  if (typeof raw !== "string") return undefined;
  const text = raw.trim().toLowerCase();
  if (["1", "t", "true"].includes(text)) return true;
  if (["0", "f", "false"].includes(text)) return false;
  return undefined;
};

/** 账号 JSON 里的覆盖值。字段是 disable_cooling，更早的文件写的是 disable-cooling，后端两个都认。 */
export const coolingModeFromAuthJson = (
  json: Record<string, unknown> | null | undefined,
): CoolingMode => {
  if (!json) return "";
  const current = parseOverride(json.disable_cooling);
  return coolingModeFromOverride(current ?? parseOverride(json["disable-cooling"]));
};

/** 把选择写回账号 JSON。旧键一并删掉，否则「跟随全局」保存后旧键还会生效。 */
export const writeCoolingModeToAuthJson = (
  json: Record<string, unknown>,
  mode: CoolingMode,
): void => {
  delete json["disable-cooling"];
  const value = coolingOverrideFromMode(mode);
  if (value === undefined) delete json.disable_cooling;
  else json.disable_cooling = value;
};
