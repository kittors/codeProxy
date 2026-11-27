import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Icon as SatinIcon } from "satin-ui/react";
import {
  ensureLanguageResources,
  LANGUAGE_ORDER,
  STORAGE_KEY_LANGUAGE,
  type Language,
} from "@code-proxy/i18n";
import { resolvePortalContainer } from "../overlays/portalContainer";
import { useSatinFloatingLayer } from "../overlays/useSatinFloatingLayer";
import { cn } from "../utils/selectStyles";

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

/** 遵循 Satin 禁 emoji 规范，采用跨平台一致的等宽语种缩写徽标。 */
const LANGUAGE_CODES: Record<Language, string> = {
  "zh-CN": "ZH",
  en: "EN",
  ru: "RU",
};

export interface LanguageSelectorProps {
  className?: string;
  variant?: "ghost" | "secondary";
  size?: "sm" | "md" | "lg";
}

const SIZE_CLASS: Record<NonNullable<LanguageSelectorProps["size"]>, string> = {
  sm: "sn-sm",
  md: "",
  lg: "sn-lg",
};

export function LanguageSelector({
  className,
  variant = "ghost",
  size = "sm",
}: LanguageSelectorProps) {
  const { i18n, t } = useTranslation();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const floating = useSatinFloatingLayer({
    open,
    anchorRef: triggerRef,
    panelRef: listRef,
    placement: "bottom",
    align: "end",
    gap: 6,
    margin: 8,
    onClose: (_reason, refocus) => {
      setOpen(false);
      if (refocus) triggerRef.current?.focus({ preventScroll: true });
    },
  });

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
      triggerRef.current?.focus();
    },
    [i18n],
  );

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") {
        return;
      }
      const panel = listRef.current;
      if (!panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>('[role="option"]'));
      if (items.length === 0) return;
      e.preventDefault();
      if (e.key === "Home") {
        items[0]?.focus();
        return;
      }
      if (e.key === "End") {
        items[items.length - 1]?.focus();
        return;
      }
      const cur = items.indexOf(document.activeElement as HTMLElement);
      const nextIdx =
        e.key === "ArrowDown"
          ? (cur + 1 + items.length) % items.length
          : (cur - 1 + items.length) % items.length;
      items[nextIdx]?.focus();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  const label = t("language.switch");
  const shortLabel = SHORT_LABELS[currentValue] ?? currentValue;
  const tooltip = `${label}: ${t(LANGUAGE_LABEL_KEYS[currentValue])}`;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className={cn(
          "sn-btn gap-1.5",
          variant === "secondary" ? "sn-secondary" : "sn-ghost",
          SIZE_CLASS[size],
          open ? "sn-is-open" : null,
          className,
        )}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="listbox"
        data-tip={tooltip}
        data-tip-side="bottom"
      >
        <SatinIcon name="compass" size={15} />
        <span className="text-xs font-semibold leading-none">{shortLabel}</span>
      </button>

      {floating.mounted
        ? createPortal(
            <div
              ref={listRef}
              role="listbox"
              aria-hidden={floating.isOpen ? undefined : true}
              data-state={floating.isOpen ? "open" : "closed"}
              data-side={floating.side}
              aria-label={label}
              className={cn(
                "sn-menu sn-float sn-solid !w-44 !min-w-44 outline-none",
                floating.isOpen ? "sn-open" : null,
                floating.up ? "sn-up" : null,
                floating.end ? "sn-end" : null,
              )}
              style={{
                top: floating.top,
                left: floating.left,
                transformOrigin: floating.origin,
              }}
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
                      "sn-item w-full border-0 bg-transparent text-left outline-none hover:bg-[var(--sn-b-ghost-hover)] focus:bg-[var(--sn-b-ghost-hover)]",
                      selected ? "sn-sel font-medium" : null,
                    )}
                  >
                    <code
                      className="inline-flex h-5 w-7 flex-none items-center justify-center rounded-md bg-[var(--sn-fill-subtle)] font-mono text-2xs font-semibold text-[var(--sn-label2)]"
                      aria-hidden="true"
                    >
                      {LANGUAGE_CODES[lng]}
                    </code>
                    <span className="min-w-0 flex-1 truncate">{t(LANGUAGE_LABEL_KEYS[lng])}</span>
                    {selected ? (
                      <span className="sn-chk">
                        <SatinIcon name="check" size={14} />
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>,
            resolvePortalContainer(triggerRef.current),
          )
        : null}
    </>
  );
}
