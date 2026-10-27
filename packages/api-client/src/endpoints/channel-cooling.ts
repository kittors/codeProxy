/**
 * 渠道的 429 冷却开关（后端字段 `disable-cooling`）。
 *
 * 每个 AI 供应商渠道都可以覆盖全局的 disable-cooling：`true` 表示这个渠道回 429/5xx 时不停用、
 * 下一个请求照常发给它，`false` 表示即使全局关了冷却它也照常冷却，不写就跟随全局。面板里用
 * `disableCooling?: boolean` 表示，`undefined` 就是「跟随全局」。
 *
 * 后端在每个渠道列表的 GET 里用 `capabilities["disable-cooling"]` 声明它能保存这个字段。面板会从
 * 最新 release 自动更新、可能连着旧后端，而旧后端（gin 忽略未知字段）会把开关静默丢掉，所以只有
 * 后端声明过才显示开关。声明随列表一起返回，这里记下最近一次读到的结果，弹窗按它决定是否显示，
 * 不必为一个标记再发请求。
 */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** 从后端的渠道条目里读出覆盖值；没写（跟随全局）时返回空对象，方便直接展开进归一化结果。 */
export const readDisableCooling = (item: Record<string, unknown>): { disableCooling?: boolean } => {
  const value = item["disable-cooling"];
  return typeof value === "boolean" ? { disableCooling: value } : {};
};

/** 整表保存（PUT）用：只有明确开或关时才写；不写就是跟随全局。 */
export const writeDisableCooling = (
  payload: Record<string, unknown>,
  value: boolean | undefined,
): void => {
  if (typeof value === "boolean") payload["disable-cooling"] = value;
};

/**
 * 单条修改（PATCH）用：没写的键后端会保留原值，所以「跟随全局」必须明确发 null 才能清掉旧的覆盖。
 * 旧后端不认识这个键，会直接忽略。
 */
export const withDisableCoolingPatch = (
  payload: Record<string, unknown>,
  value: boolean | undefined,
): Record<string, unknown> => ({
  ...payload,
  "disable-cooling": typeof value === "boolean" ? value : null,
});

let supported = false;
const listeners = new Set<() => void>();

/** 读一个渠道列表响应里的能力声明。 */
export const readChannelCoolingSupport = (payload: unknown): boolean =>
  isRecord(payload) &&
  isRecord(payload.capabilities) &&
  payload.capabilities["disable-cooling"] === true;

/** 每次读到渠道列表都调用：记下后端是否声明了这个字段，变了就通知订阅者。 */
export const rememberChannelCoolingSupport = (payload: unknown): void => {
  const next = readChannelCoolingSupport(payload);
  if (next === supported) return;
  supported = next;
  listeners.forEach((listener) => listener());
};

export const isChannelCoolingSupported = (): boolean => supported;

export const subscribeChannelCoolingSupport = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
