import { useTranslation } from "react-i18next";
import { Languages } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { SUPPORTED_LANGUAGES, LANGUAGE_LABEL_KEYS } from "@/utils/constants";
import type { Language } from "@/types";
import { STORAGE_KEY_LANGUAGE } from "@/utils/constants";

export function LanguageSelector({ className }: { className?: string }) {
    const { i18n, t } = useTranslation();

    const handleLanguageChange = (lng: string) => {
        i18n.changeLanguage(lng).catch(console.error);
        try {
            localStorage.setItem(STORAGE_KEY_LANGUAGE, JSON.stringify({ language: lng, state: { language: lng } }));
        } catch {
            // ignore
        }
    };

    const currentLanguage = i18n.language as Language;

    return (
        <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
                <button
                    type="button"
                    aria-label={t("language.switch")}
                    title={t("language.switch")}
                    className={className}
                >
                    <Languages size={16} />
                </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
                <DropdownMenu.Content
                    align="end"
                    sideOffset={8}
                    className="z-[100] min-w-[120px] rounded-xl border border-slate-200 bg-white p-1 text-slate-800 shadow-xl dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200"
                >
                    {SUPPORTED_LANGUAGES.map((lng) => {
                        const isActive = currentLanguage?.startsWith(lng) || (lng === "zh-CN" && currentLanguage?.startsWith("zh"));
                        return (
                            <DropdownMenu.Item
                                key={lng}
                                onClick={() => handleLanguageChange(lng)}
                                className={`flex cursor-pointer select-none items-center rounded-lg px-3 py-2 text-sm outline-none transition-colors data-[highlighted]:bg-slate-100 dark:data-[highlighted]:bg-neutral-800 ${isActive ? "bg-slate-100 font-medium text-slate-900 dark:bg-neutral-800 dark:text-white" : ""
                                    }`}
                            >
                                {t(LANGUAGE_LABEL_KEYS[lng])}
                            </DropdownMenu.Item>
                        );
                    })}
                </DropdownMenu.Content>
            </DropdownMenu.Portal>
        </DropdownMenu.Root>
    );
}
