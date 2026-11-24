import {
  createContext,
  type PropsWithChildren,
  use,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Icon as SatinIcon } from "satin-ui/react";
import { cn } from "../utils/selectStyles";

const THEME_STORAGE_KEY = "code-proxy-admin-theme";
const THEME_TRANSITION_LOCK_CLASS = "theme-transition-lock";
const THEME_TRANSITION_LOCK_RELEASE_MS = 120;

let transitionLockTimer: number | null = null;

export type ThemeMode = "light" | "dark";
export type ThemePreference = ThemeMode | "auto";

interface ThemeContextState {
  state: {
    mode: ThemeMode;
    preference: ThemePreference;
    systemMode: ThemeMode;
  };
  actions: {
    setMode: (mode: ThemePreference) => void;
    toggle: () => void;
  };
}

const ThemeContext = createContext<ThemeContextState | null>(null);

const THEME_OPTIONS = [
  { value: "light", labelKey: "theme.light", icon: "sun" },
  { value: "dark", labelKey: "theme.dark", icon: "moon" },
  { value: "auto", labelKey: "theme.auto", icon: "monitor" },
] as const;

const isThemePreference = (value: unknown): value is ThemePreference =>
  value === "light" || value === "dark" || value === "auto";

const readThemeSnapshot = (): ThemePreference | null => {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemePreference(raw)) {
      return raw;
    }
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (typeof parsed === "object" && parsed !== null) {
      const state = "state" in parsed ? parsed.state : undefined;
      if (typeof state === "object" && state !== null && "theme" in state) {
        const theme = state.theme;
        if (isThemePreference(theme)) return theme;
      }
      if ("theme" in parsed && isThemePreference(parsed.theme)) return parsed.theme;
      if ("mode" in parsed && isThemePreference(parsed.mode)) return parsed.mode;
    }
    return null;
  } catch {
    return null;
  }
};

const resolveSystemTheme = (): ThemeMode => {
  if (typeof window === "undefined") {
    return "light";
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light";
};

const applyThemeToDom = (mode: ThemeMode): void => {
  if (typeof document === "undefined") {
    return;
  }

  const isDark = mode === "dark";

  document.documentElement.classList.toggle("dark", isDark);
  document.documentElement.style.colorScheme = mode;
  // 显式写入 data-theme="light" | "dark"，避免系统深色 + 应用手选浅色时命中
  // Satin tokens.css 的 @media (prefers-color-scheme: dark) { :root:not([data-theme]) }。
  document.documentElement.setAttribute("data-theme", mode);
};

const persistTheme = (mode: ThemePreference): void => {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // Ignore unavailable storage, e.g. hardened browser settings.
  }
};

const lockThemeTransitions = (): void => {
  if (typeof document === "undefined") {
    return;
  }

  const root = document.documentElement;
  root.classList.add(THEME_TRANSITION_LOCK_CLASS);

  if (transitionLockTimer !== null) {
    window.clearTimeout(transitionLockTimer);
    transitionLockTimer = null;
  }

  // Ensure the transition lock wins in computed styles before color classes change.
  void root.offsetHeight;

  const release = () => {
    transitionLockTimer = window.setTimeout(() => {
      root.classList.remove(THEME_TRANSITION_LOCK_CLASS);
      transitionLockTimer = null;
    }, THEME_TRANSITION_LOCK_RELEASE_MS);
  };

  if (typeof window.requestAnimationFrame !== "function") {
    release();
    return;
  }

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(release);
  });
};

export function ThemeProvider({ children }: PropsWithChildren) {
  const [preference, setPreferenceState] = useState<ThemePreference>(
    () => readThemeSnapshot() ?? "auto",
  );
  const [systemMode, setSystemMode] = useState<ThemeMode>(() => resolveSystemTheme());
  const mode = preference === "auto" ? systemMode : preference;

  useEffect(() => {
    applyThemeToDom(mode);
    persistTheme(preference);
  }, [mode, preference]);

  const setMode = useCallback((next: ThemePreference) => {
    const nextSystemMode = resolveSystemTheme();
    const nextMode = next === "auto" ? nextSystemMode : next;
    lockThemeTransitions();
    applyThemeToDom(nextMode);
    persistTheme(next);
    setSystemMode(nextSystemMode);
    setPreferenceState(next);
  }, []);

  const toggle = useCallback(() => {
    setMode(mode === "dark" ? "light" : "dark");
  }, [mode, setMode]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      const next = mediaQuery.matches ? "dark" : "light";
      setSystemMode(next);
      if (preference === "auto") {
        lockThemeTransitions();
        applyThemeToDom(next);
      }
    };
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [preference]);

  const value = useMemo<ThemeContextState>(
    () => ({
      state: { mode, preference, systemMode },
      actions: { setMode, toggle },
    }),
    [mode, preference, setMode, systemMode, toggle],
  );

  return <ThemeContext value={value}>{children}</ThemeContext>;
}

export const useTheme = (): ThemeContextState => {
  const context = use(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
};

export function ThemeToggleButton({ className, label }: { className?: string; label?: string }) {
  const { t } = useTranslation();
  const {
    state: { mode, preference },
    actions: { setMode },
  } = useTheme();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const selectedOption = THEME_OPTIONS.find((option) => option.value === preference);
  const triggerIconName = preference === "auto" ? "monitor" : mode === "dark" ? "moon" : "sun";
  const buttonLabel = label ?? t("theme.switch");
  const tooltip = `${buttonLabel}: ${t(selectedOption?.labelKey ?? "theme.switch")}`;

  const reposition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const width = 220;
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
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", handleClick);
    return () => document.removeEventListener("pointerdown", handleClick);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  const handleModeChange = (next: ThemePreference) => {
    setMode(next);
    setOpen(false);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={cn("sn-btn sn-ghost sn-ibtn sn-round", open ? "sn-is-open" : null, className)}
        aria-label={buttonLabel}
        aria-expanded={open}
        aria-haspopup="menu"
        data-tip={tooltip}
      >
        <SatinIcon name={triggerIconName} size={16} />
      </button>

      {open
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              data-state="open"
              data-side="bottom"
              aria-label={buttonLabel}
              className="sn-menu sn-solid sn-open w-[220px]"
              style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999 }}
            >
              {THEME_OPTIONS.map(({ value, labelKey, icon }) => {
                const selected = value === preference;
                return (
                  <button
                    key={value}
                    type="button"
                    role="menuitemradio"
                    aria-checked={selected}
                    onClick={() => handleModeChange(value)}
                    className={cn(
                      "sn-item w-full border-0 bg-transparent text-left hover:bg-[var(--sn-b-ghost-hover)]",
                      selected ? "sn-sel font-medium" : null,
                    )}
                  >
                    <SatinIcon name={icon} size={16} />
                    <span className="min-w-0 flex-1 truncate">{t(labelKey)}</span>
                    {selected ? (
                      <span className="sn-chk">
                        <SatinIcon name="check" size={14} />
                      </span>
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
