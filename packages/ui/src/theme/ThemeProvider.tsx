import {
  createContext,
  type PropsWithChildren,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Moon, Sun } from "lucide-react";
const THEME_STORAGE_KEY = "code-proxy-admin-theme";
const THEME_TRANSITION_LOCK_CLASS = "theme-transition-lock";
const THEME_TRANSITION_LOCK_RELEASE_MS = 120;

let transitionLockTimer: number | null = null;

export type ThemeMode = "light" | "dark";

interface ThemeContextState {
  state: {
    mode: ThemeMode;
  };
  actions: {
    setMode: (mode: ThemeMode) => void;
    toggle: () => void;
  };
}

const ThemeContext = createContext<ThemeContextState | null>(null);

const readThemeSnapshot = (): ThemeMode | null => {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (raw === "dark" || raw === "light") {
      return raw;
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
  if (isDark) {
    document.documentElement.setAttribute("data-theme", "dark");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
};

const persistTheme = (mode: ThemeMode): void => {
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
  const [mode, setModeState] = useState<ThemeMode>(
    () => readThemeSnapshot() ?? resolveSystemTheme(),
  );

  useEffect(() => {
    applyThemeToDom(mode);
    persistTheme(mode);
  }, [mode]);

  const setMode = useCallback((next: ThemeMode) => {
    lockThemeTransitions();
    applyThemeToDom(next);
    persistTheme(next);
    setModeState(next);
  }, []);

  const toggle = useCallback(() => {
    setMode(mode === "dark" ? "light" : "dark");
  }, [mode, setMode]);

  const value = useMemo<ThemeContextState>(
    () => ({
      state: { mode },
      actions: { setMode, toggle },
    }),
    [mode, setMode, toggle],
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
  const {
    state: { mode },
    actions: { toggle },
  } = useTheme();

  const Icon = mode === "dark" ? Sun : Moon;
  const text = label ?? (mode === "dark" ? "Switch to light" : "Switch to dark");

  return (
    <button type="button" onClick={toggle} className={className} aria-label={text} title={text}>
      <Icon size={16} />
    </button>
  );
}
