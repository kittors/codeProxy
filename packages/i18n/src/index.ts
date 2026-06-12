import i18n from "i18next";
import { initReactI18next } from "react-i18next";

export const STORAGE_KEY_LANGUAGE = "cli-proxy-language";
export const LANGUAGE_ORDER = ["zh-CN", "en", "ru"] as const;
export type Language = (typeof LANGUAGE_ORDER)[number];
type TranslationResource = Record<string, unknown>;

const localeLoaders: Record<Language, () => Promise<TranslationResource>> = {
  "zh-CN": () => import("./locales/zh-CN.json").then((mod) => mod.default),
  en: () => import("./locales/en.json").then((mod) => mod.default),
  ru: () => import("./locales/ru.json").then((mod) => mod.default),
};

const loadedLanguages = new Set<string>();
const pendingLoads = new Map<string, Promise<void>>();

const resolveLanguage = (language: string): Language =>
  LANGUAGE_ORDER.includes(language as Language) ? (language as Language) : "zh-CN";

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
  if (loadedLanguages.has(resolved)) return;

  const pending = pendingLoads.get(resolved);
  if (pending) return pending;

  const load = localeLoaders[resolved]()
    .then((resource) => {
      i18n.addResourceBundle(resolved, "translation", resource, true, true);
      loadedLanguages.add(resolved);
    })
    .finally(() => {
      pendingLoads.delete(resolved);
    });
  pendingLoads.set(resolved, load);
  return load;
};

const loadInitialResource = async (language: Language) => {
  const resource = await localeLoaders[language]();
  return [language, { translation: resource }] as const;
};

const initialLanguage = resolveLanguage(getInitialLanguage());
const initialLanguages = Array.from(new Set<Language>([initialLanguage, "zh-CN"]));
const initialEntries = await Promise.all(initialLanguages.map(loadInitialResource));

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources: Object.fromEntries(initialEntries),
    lng: initialLanguage,
    fallbackLng: "zh-CN",
    interpolation: { escapeValue: false },
    defaultNS: "translation",
    fallbackNS: "translation",
    react: {
      useSuspense: false,
    },
  });
}

initialLanguages.forEach((language) => loadedLanguages.add(language));

const originalChangeLanguage = i18n.changeLanguage.bind(i18n);
i18n.changeLanguage = (async (
  language?: string,
  callback?: Parameters<typeof i18n.changeLanguage>[1],
) => {
  if (typeof language === "string") {
    await ensureLanguageResources(language);
  }
  return originalChangeLanguage(language, callback);
}) as typeof i18n.changeLanguage;

export default i18n;
