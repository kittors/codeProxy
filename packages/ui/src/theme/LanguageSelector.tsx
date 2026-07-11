import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Check, Languages } from "lucide-react";
import {
  ensureLanguageResources,
  LANGUAGE_ORDER,
  STORAGE_KEY_LANGUAGE,
  type Language,
} from "@code-proxy/i18n";
import { HoverTooltip } from "../overlays/Tooltip";
import {
  cn,
  selectOptionBase,
  selectOptionIdle,
  selectOptionSelected,
  selectPanel,
} from "../utils/selectStyles";

const SUPPORTED_LANGUAGES = LANGUAGE_ORDER;
const LANGUAGE_LABEL_KEYS: Record<Language, string> = {
  "zh-CN": "language.chinese",
  en: "language.english",
  ru: "language.russian",
};

/** Short labels for each language, shown next to the icon */
const SHORT_LABELS: Record<Language, string> = {
  en: "EN",
  "zh-CN": "中",
  ru: "RU",
};

const FLAG_ICONS: Record<Language, string> = {
  "zh-CN": "🇨🇳",
  en: "🇬🇧",
  ru: "🇷🇺",
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
    const width = 170;
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
  const tooltip = `${label}: ${t(LANGUAGE_LABEL_KEYS[currentValue])}`;

  return (
    <>
      <HoverTooltip content={tooltip}>
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className={className}
          aria-label={label}
          aria-expanded={open}
          aria-haspopup="listbox"
        >
          <Languages size={16} />
          <span className="ml-1 text-xs font-bold leading-none">{shortLabel}</span>
        </button>
      </HoverTooltip>

      {open
        ? createPortal(
            <div
              ref={listRef}
              role="listbox"
              data-state="open"
              data-side="bottom"
              aria-label={label}
              className={cn(selectPanel, "w-[170px]")}
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
                    className={cn(
                      selectOptionBase,
                      selected ? selectOptionSelected : selectOptionIdle,
                    )}
                  >
                    <span className="shrink-0 text-base leading-none" aria-hidden="true">
                      {FLAG_ICONS[lng]}
                    </span>
                    <span className="flex-1 truncate">{t(LANGUAGE_LABEL_KEYS[lng])}</span>
                    {selected ? <Check size={14} className="shrink-0" aria-hidden="true" /> : null}
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
