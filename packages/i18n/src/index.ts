import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import ru from "./locales/ru.json";
import zhCN from "./locales/zh-CN.json";

export const STORAGE_KEY_LANGUAGE = "cli-proxy-language";
export const LANGUAGE_ORDER = ["zh-CN", "en", "ru"] as const;
export type Language = (typeof LANGUAGE_ORDER)[number];

const resources = {
  "zh-CN": { translation: zhCN },
  en: { translation: en },
  ru: { translation: ru },
};

const loadedLanguages = new Set<string>(LANGUAGE_ORDER);

const resolveLanguage = (language: string): string =>
  LANGUAGE_ORDER.includes(language as Language) ? language : "zh-CN";

const getInitialLanguage = (): string => {
  if (typeof window === "undefined") return "zh-CN";
  try {
    const stored = localStorage.getItem(STORAGE_KEY_LANGUAGE);
    if (stored) {
      const parsed = JSON.parse(stored);
      const candidate = parsed?.state?.language ?? parsed?.language ?? parsed;
      if (typeof candidate === "string" && LANGUAGE_ORDER.includes(candidate as Language)) {
        return candidate;
      }
    }
  } catch {}
  if (typeof navigator !== "undefined") {
    const raw = navigator.language || "zh-CN";
    if (raw.toLowerCase().startsWith("zh")) return "zh-CN";
    return "en";
  }
  return "zh-CN";
};

export const ensureLanguageResources = async (language: string): Promise<void> => {
  const resolved = resolveLanguage(language);
  if (!loadedLanguages.has(resolved)) {
    i18n.addResourceBundle(
      resolved,
      "translation",
      resources[resolved as Language].translation,
      true,
      true,
    );
    loadedLanguages.add(resolved);
  }
};

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources,
    lng: getInitialLanguage(),
    fallbackLng: "zh-CN",
    interpolation: { escapeValue: false },
    defaultNS: "translation",
    fallbackNS: "translation",
  });
}

export default i18n;
