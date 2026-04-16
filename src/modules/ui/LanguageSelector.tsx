import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { ensureLanguageResources } from "@/i18n";
import { Check, Languages } from "lucide-react";
import { SUPPORTED_LANGUAGES, LANGUAGE_LABEL_KEYS, STORAGE_KEY_LANGUAGE } from "@/utils/constants";
import type { Language } from "@/types";

/** Short labels for each language, shown next to the icon */
const SHORT_LABELS: Record<string, string> = {
  en: "EN",
  "zh-CN": "中",
};

export function LanguageSelector({ className }: { className?: string }) {
  const { i18n, t } = useTranslation();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const currentLanguage = i18n.language as Language;
  const currentValue =
    SUPPORTED_LANGUAGES.find(
      (lng) =>
        currentLanguage?.startsWith(lng) || (lng === "zh-CN" && currentLanguage?.startsWith("zh")),
    ) ?? SUPPORTED_LANGUAGES[0];

  const handleLanguageChange = useCallback(
    (lng: string) => {
      void ensureLanguageResources(lng)
        .then(() => i18n.changeLanguage(lng))
        .catch(console.error);
      try {
        localStorage.setItem(
          STORAGE_KEY_LANGUAGE,
          JSON.stringify({ language: lng, state: { language: lng } }),
        );
      } catch {
        // ignore
      }
      setOpen(false);
    },
    [i18n],
  );

  const reposition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const width = 130;
    const margin = 8;
    const nextLeft = rect.right - width;
    const maxLeft = Math.max(margin, window.innerWidth - width - margin);
    const left = Math.min(Math.max(margin, nextLeft), maxLeft);
    setPos({ top: rect.bottom + 6, left });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    reposition();
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open, reposition]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (triggerRef.current?.contains(target) || listRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", handleClick);
    return () => document.removeEventListener("pointerdown", handleClick);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  const label = t("language.switch");
  const shortLabel = SHORT_LABELS[currentValue] ?? currentValue;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={className}
        aria-label={label}
        title={label}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <Languages size={16} />
        <span className="ml-1 text-[11px] font-bold leading-none">{shortLabel}</span>
      </button>

      {open
        ? createPortal(
            <div
              ref={listRef}
              role="listbox"
              aria-label={label}
              className="fixed z-[9999] w-[130px] overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
              style={{ top: pos.top, left: pos.left }}
            >
              {SUPPORTED_LANGUAGES.map((lng) => {
                const selected = lng === currentValue;
                return (
                  <button
                    key={lng}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => handleLanguageChange(lng)}
                    className={[
                      "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm outline-none transition-colors",
                      "hover:bg-slate-100 dark:hover:bg-white/10",
                      selected
                        ? "font-medium text-slate-900 dark:text-white"
                        : "text-slate-600 dark:text-slate-300",
                    ].join(" ")}
                  >
                    <span className="flex-1 truncate">{t(LANGUAGE_LABEL_KEYS[lng])}</span>
                    {selected ? (
                      <Check
                        size={14}
                        className="shrink-0 text-slate-400 dark:text-white/50"
                        aria-hidden="true"
                      />
                    ) : null}
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
