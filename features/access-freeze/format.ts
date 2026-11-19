import {
  extractApiErrorCode,
  isApiClientError,
  type AccessFreezeSubjectKind,
} from "@code-proxy/api-client";

type Translate = (key: string, options?: Record<string, unknown>) => string;

/** 解冻备注的长度上限，同后端（超出回 400 note_too_long）。 */
export const RELEASE_NOTE_MAX_LENGTH = 500;

/**
 * 冻结界面里的「被冻结方」：一个门户账号，或一把不属于任何门户账号的 Key。name 是界面上的称呼
 * （账号昵称、Key 名称，取不到时是 Key id 的前 8 位）。
 */
export interface AccessFreezeSubjectRef {
  kind: AccessFreezeSubjectKind;
  id: string;
  name: string;
}

/** 上游的名字：厂商名；运营者自命名的上游没有厂商名，也不该暴露它的渠道名，统一写「其他上游」。 */
export const freezeProviderName = (t: Translate, source: { provider_name: string }): string =>
  source.provider_name.trim() || t("access_freeze.other_provider");

/** 时刻按界面语言显示；解析不了时原样返回，没有时为短横线。 */
export function formatFreezeTime(iso: string | undefined, language?: string): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  try {
    return date.toLocaleString(language || undefined);
  } catch {
    return date.toLocaleString();
  }
}

/** Key 没有名字、或名字取不到时的称呼：id 的前 8 位足够在列表里认出是哪一把。 */
export const shortKeyId = (id: string): string => id.slice(0, 8);

/**
 * 后端的错误码换成界面文案（错误体是 `{"error":{"code","message"}}`，api-client 已经把 message 读成
 * Error.message；这里认得的码换成按界面语言写的说法，不认得的照原文，原文也没有就用 fallback）。
 */
export function describeFreezeError(t: Translate, error: unknown, fallback: string): string {
  const code = isApiClientError(error) ? extractApiErrorCode(error.payload) : "";
  switch (code) {
    case "access_freeze_not_found":
      return t("access_freeze.error_not_found");
    case "access_freeze_already_released":
      return t("access_freeze.error_already_released");
    case "access_freezes_unavailable":
      return t("access_freeze.error_unavailable");
    case "note_too_long":
      return t("access_freeze.error_note_too_long", { max: RELEASE_NOTE_MAX_LENGTH });
    case "invalid_threshold":
      return t("access_freeze.error_invalid_threshold");
  }
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

/** 出错是不是后端说「没有数据库、冻结用不了」：这时整块界面都不该出现。 */
export const isFreezeUnavailable = (error: unknown): boolean =>
  isApiClientError(error) && extractApiErrorCode(error.payload) === "access_freezes_unavailable";

/**
 * 解冻时，冻结已经不在了（别人先解冻了、记录被清理）：界面要做的是刷新，不是让人重试。
 */
export const isFreezeGone = (error: unknown): boolean => {
  if (!isApiClientError(error)) return false;
  const code = extractApiErrorCode(error.payload);
  return code === "access_freeze_already_released" || code === "access_freeze_not_found";
};
