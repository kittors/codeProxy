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

export interface ThemeToggleButtonProps {
  className?: string;
  label?: string;
  variant?: "ghost" | "secondary";
  size?: "sm" | "md" | "lg";
}

const TOGGLE_SIZE_CLASS: Record<NonNullable<ThemeToggleButtonProps["size"]>, string> = {
  sm: "sn-sm",
  md: "",
  lg: "sn-lg",
};

export function ThemeToggleButton({
  className,
  label,
  variant = "ghost",
  size = "md",
}: ThemeToggleButtonProps) {
  const { t } = useTranslation();
  const {
    state: { mode, preference },
    actions: { setMode },
  } = useTheme();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number; side: "bottom" | "top"; ready: boolean }>({
    top: 0,
    left: 0,
    side: "bottom",
    ready: false,
  });

  const selectedOption = THEME_OPTIONS.find((option) => option.value === preference);
  const triggerIconName = preference === "auto" ? "monitor" : mode === "dark" ? "moon" : "sun";
  const buttonLabel = label ?? t("theme.switch");
  const tooltip = `${buttonLabel}: ${t(selectedOption?.labelKey ?? "theme.switch")}`;

  const reposition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const width = menuRef.current?.offsetWidth || 200;
    const height = menuRef.current?.offsetHeight || 116;
    const margin = 8;
    const gap = 6;
    const vw = window.innerWidth || 1024;
    const vh = window.innerHeight || 768;

    const nextLeft = rect.right - width;
    const maxLeft = Math.max(margin, vw - width - margin);
    const left = Math.min(Math.max(margin, nextLeft), maxLeft);

    const openAbove = vh - rect.bottom - gap < height && rect.top - gap > vh - rect.bottom;
    const rawTop = openAbove ? rect.top - gap - height : rect.bottom + gap;
    const top = Math.min(Math.max(margin, rawTop), Math.max(margin, vh - height - margin));
    setPos({ top: Math.round(top), left: Math.round(left), side: openAbove ? "top" : "bottom", ready: true });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setPos((prev) => (prev.ready ? { ...prev, ready: false } : prev));
      return;
    }
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
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Home" || event.key === "End") {
        const panel = menuRef.current;
        if (!panel) return;
        const items = Array.from(panel.querySelectorAll<HTMLElement>('[role="menuitemradio"]'));
        if (items.length === 0) return;
        event.preventDefault();
        if (event.key === "Home") {
          items[0]?.focus();
          return;
        }
        if (event.key === "End") {
          items[items.length - 1]?.focus();
          return;
        }
        const cur = items.indexOf(document.activeElement as HTMLElement);
        const nextIdx =
          event.key === "ArrowDown"
            ? (cur + 1 + items.length) % items.length
            : (cur - 1 + items.length) % items.length;
        items[nextIdx]?.focus();
      }
    };
    document.addEventListener("pointerdown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("pointerdown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const handleModeChange = (next: ThemePreference) => {
    setMode(next);
    setOpen(false);
    triggerRef.current?.focus();
  };

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
          "sn-btn sn-ibtn",
          variant === "secondary" ? "sn-secondary" : "sn-ghost",
          TOGGLE_SIZE_CLASS[size],
          open ? "sn-is-open" : null,
          className,
        )}
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
              data-side={pos.side}
              aria-label={buttonLabel}
              className="sn-menu sn-solid code-proxy-floating-surface w-48 outline-none"
              style={{
                position: "fixed",
                top: pos.top,
                left: pos.left,
                zIndex: 9999,
                visibility: pos.ready ? undefined : "hidden",
              }}
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
                      "sn-item w-full border-0 bg-transparent text-left outline-none hover:bg-[var(--sn-b-ghost-hover)] focus:bg-[var(--sn-b-ghost-hover)]",
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
