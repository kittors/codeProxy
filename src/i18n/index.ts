/**
 * i18next 国际化配置
 */

import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { getInitialLanguage } from "@/utils/language";

type TranslationResource = Record<string, unknown>;
type LoadedLocale = "zh-CN" | "en" | "ru";

const localeLoaders: Record<LoadedLocale, () => Promise<TranslationResource>> = {
  "zh-CN": () => import("./locales/zh-CN.json").then((mod) => mod.default),
  en: () => import("./locales/en.json").then((mod) => mod.default),
  ru: () => import("./locales/ru.json").then((mod) => mod.default),
};

const loadedLanguages = new Set<string>();
const pendingLoads = new Map<string, Promise<void>>();

const resolveLanguage = (language: string): LoadedLocale =>
  language === "en" || language === "ru" || language === "zh-CN" ? language : "zh-CN";

const loadTranslation = async (language: LoadedLocale) => {
  const resource = await localeLoaders[language]();
  return { translation: resource };
};

export const ensureLanguageResources = async (language: string): Promise<void> => {
  const resolved = resolveLanguage(language);
  if (loadedLanguages.has(resolved)) return;
  const pending = pendingLoads.get(resolved);
  if (pending) return pending;

  const load = localeLoaders[resolved]().then((resource) => {
    i18n.addResourceBundle(resolved, "translation", resource, true, true);
    loadedLanguages.add(resolved);
    pendingLoads.delete(resolved);
  });
  pendingLoads.set(resolved, load);
  return load;
};

const initialLanguage = getInitialLanguage();
const initialLanguages = Array.from(new Set<LoadedLocale>([resolveLanguage(initialLanguage), "zh-CN"]));
const initialEntries = await Promise.all(
  initialLanguages.map(async (language) => [language, await loadTranslation(language)] as const),
);

i18n.use(initReactI18next).init({
  resources: Object.fromEntries(initialEntries),
  lng: initialLanguage,
  fallbackLng: "zh-CN",
  interpolation: {
    escapeValue: false, // React 已经转义
  },
  react: {
    useSuspense: false,
  },
});

initialLanguages.forEach((language) => loadedLanguages.add(language));

export default i18n;
