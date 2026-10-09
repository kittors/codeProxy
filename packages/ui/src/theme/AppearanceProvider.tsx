import {
  createContext,
  type PropsWithChildren,
  use,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import { setChartAppearance } from "../charts/chartTheme";
import {
  APPEARANCE_STORAGE_KEY,
  APPEARANCE_VAR_NAMES,
  DEFAULT_APPEARANCE,
  appearanceAttributes,
  appearanceVars,
  applyStylePreset,
  matchStylePreset,
  normalizeAppearance,
  parseStoredAppearance,
  serializeAppearance,
  type AppearanceSettings,
  type StylePresetId,
} from "./appearance";

interface AppearanceContextValue {
  settings: AppearanceSettings;
  preset: StylePresetId | "custom";
  update: (patch: Partial<AppearanceSettings>) => void;
  applyPreset: (id: StylePresetId) => void;
  reset: () => void;
}

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

const readStoredSettings = (): AppearanceSettings => {
  try {
    return parseStoredAppearance(localStorage.getItem(APPEARANCE_STORAGE_KEY));
  } catch {
    return DEFAULT_APPEARANCE;
  }
};

/**
 * 写到 <html> 上：data-palette / data-icons / data-bars 三个开关，以及 --cp-pref-* 变量
 * （行内样式，盖过样式表里的默认值，也盖过 data-os 这类属性选择器）。不再需要的变量要删掉，
 * 否则从自选强调色切回墨色时旧值还留在行内样式里。
 */
export function applyAppearanceToDom(settings: AppearanceSettings): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const attrs = appearanceAttributes(settings);
  root.setAttribute("data-palette", attrs.palette);
  root.setAttribute("data-icons", attrs.icons);
  root.setAttribute("data-bars", attrs.bars);
  const vars = appearanceVars(settings);
  for (const name of APPEARANCE_VAR_NAMES) {
    const value = vars[name];
    if (value === undefined) root.style.removeProperty(name);
    else root.style.setProperty(name, value);
  }
}

const persistSettings = (settings: AppearanceSettings) => {
  try {
    localStorage.setItem(APPEARANCE_STORAGE_KEY, serializeAppearance(settings));
  } catch {
    // 存储不可用（无痕模式的配额、加固过的浏览器）时只在本次会话生效。
  }
};

export function AppearanceProvider({ children }: PropsWithChildren) {
  const [settings, setSettings] = useState<AppearanceSettings>(readStoredSettings);

  // 图表配色在 canvas 里，读不到 CSS 变量：在子组件渲染之前同步更新模块里的图表外观，
  // 子组件本轮重新计算 option 时就能拿到新颜色（幂等，重复调用无副作用）。
  useMemo(() => setChartAppearance(settings), [settings]);

  useLayoutEffect(() => {
    applyAppearanceToDom(settings);
  }, [settings]);

  useEffect(() => {
    persistSettings(settings);
  }, [settings]);

  // 另一个标签页改了外观：跟着换，不用刷新。
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== APPEARANCE_STORAGE_KEY) return;
      setSettings(parseStoredAppearance(event.newValue));
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const update = useCallback((patch: Partial<AppearanceSettings>) => {
    setSettings((current) => normalizeAppearance({ ...current, ...patch }));
  }, []);

  const applyPreset = useCallback((id: StylePresetId) => {
    setSettings((current) => applyStylePreset(current, id));
  }, []);

  const reset = useCallback(() => setSettings(DEFAULT_APPEARANCE), []);

  const value = useMemo<AppearanceContextValue>(
    () => ({ settings, preset: matchStylePreset(settings), update, applyPreset, reset }),
    [settings, update, applyPreset, reset],
  );

  return <AppearanceContext value={value}>{children}</AppearanceContext>;
}

const FALLBACK_CONTEXT: AppearanceContextValue = {
  settings: DEFAULT_APPEARANCE,
  preset: "colorful",
  update: () => undefined,
  applyPreset: () => undefined,
  reset: () => undefined,
};

/**
 * 读外观设置。没有 Provider 时（单测里单独渲染的组件）返回默认值而不是抛错：
 * 外观只影响颜色和尺寸，缺了它组件仍然应该能渲染。
 */
export const useAppearance = (): AppearanceContextValue =>
  use(AppearanceContext) ?? FALLBACK_CONTEXT;

/**
 * 图表 option 的 useMemo 依赖：图表配色风格或强调色变了要重新生成 option
 * （颜色写在 option 里，不会跟着 CSS 变量变）。
 */
export const useChartAppearanceKey = (): string => {
  const { settings } = useAppearance();
  return `${settings.charts}:${settings.accent}`;
};
