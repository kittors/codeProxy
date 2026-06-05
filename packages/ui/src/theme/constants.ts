export const THEME_STORAGE_KEY = "code-proxy-admin-theme";
export const STORAGE_KEY_LANGUAGE = "cli-proxy-language";
export const LANGUAGE_ORDER = ["zh-CN", "en", "ru"] as const;
export type Language = (typeof LANGUAGE_ORDER)[number];
export const SUPPORTED_LANGUAGES = LANGUAGE_ORDER;
export const LANGUAGE_LABEL_KEYS: Record<Language, string> = {
  "zh-CN": "简体中文",
  en: "English",
  ru: "Русский",
};
