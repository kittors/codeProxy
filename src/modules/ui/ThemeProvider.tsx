import {
  createContext,
  type PropsWithChildren,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { flushSync } from "react-dom";
import { Moon, Sun } from "lucide-react";
import { THEME_STORAGE_KEY } from "@/lib/constants";

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
  document.documentElement.classList.toggle("dark", mode === "dark");
};

const persistTheme = (mode: ThemeMode): void => {
  localStorage.setItem(THEME_STORAGE_KEY, mode);
};

const runWithViewTransition = (fn: () => void) => {
  const startViewTransition = document.startViewTransition;
  if (typeof startViewTransition !== "function") {
    fn();
    return;
  }
  try {
    startViewTransition(() => {
      flushSync(fn);
    });
  } catch {
    fn();
  }
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
    applyThemeToDom(next);
    persistTheme(next);
    runWithViewTransition(() => setModeState(next));
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
