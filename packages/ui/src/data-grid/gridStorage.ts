import { useCallback, useEffect, useState } from "react";
import type { GridDensity } from "./types";

/**
 * 每张表的视图偏好（列宽、隐藏列、密度）存在 localStorage 的同一个键里。
 *
 * 列宽由 DataGrid 自己读写，隐藏列和密度由页面通过 useGridPreferences 读写——两边各管各的字段，
 * 所以每次写入都是「读最新值 → 只改自己的字段 → 写回」，不会拿着一份旧快照把对方的改动盖掉。
 * 写完派发 cp-grid-prefs 事件，另一方据此重新读取（例如页面上「恢复默认视图」同时清掉列宽）。
 *
 * 列宽存的是设计像素（16px 根字号下的值），换平台、换界面缩放后比例不变。
 */

export interface GridPreferences {
  widths?: Record<string, number>;
  hidden?: string[];
  density?: GridDensity;
}

const STORAGE_PREFIX = "cp-grid:";
const STORAGE_VERSION = "v1";
export const GRID_PREFS_EVENT = "cp-grid-prefs";

const storageKey = (id: string) => `${STORAGE_PREFIX}${id}:${STORAGE_VERSION}`;

const DENSITIES: readonly GridDensity[] = ["compact", "default", "comfortable"];

function sanitize(raw: unknown): GridPreferences {
  if (!raw || typeof raw !== "object") return {};
  const value = raw as Record<string, unknown>;
  const prefs: GridPreferences = {};
  if (value.widths && typeof value.widths === "object") {
    const widths: Record<string, number> = {};
    for (const [key, width] of Object.entries(value.widths as Record<string, unknown>)) {
      if (typeof width === "number" && Number.isFinite(width) && width > 0) widths[key] = width;
    }
    prefs.widths = widths;
  }
  if (Array.isArray(value.hidden)) {
    prefs.hidden = value.hidden.filter((item): item is string => typeof item === "string");
  }
  if (typeof value.density === "string" && DENSITIES.includes(value.density as GridDensity)) {
    prefs.density = value.density as GridDensity;
  }
  return prefs;
}

export function readGridPreferences(id: string | undefined): GridPreferences {
  if (!id || typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(storageKey(id));
    return raw ? sanitize(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

export function writeGridPreferences(id: string | undefined, patch: GridPreferences | null): void {
  if (!id || typeof window === "undefined") return;
  try {
    if (patch === null) {
      window.localStorage.removeItem(storageKey(id));
    } else {
      const next = { ...readGridPreferences(id), ...patch };
      window.localStorage.setItem(storageKey(id), JSON.stringify(next));
    }
  } catch {
    // 隐私模式或配额满：偏好只在本次会话内生效，不影响表格本身。
  }
  window.dispatchEvent(new CustomEvent(GRID_PREFS_EVENT, { detail: { id } }));
}

/** 订阅某张表的偏好变化（含同页其它组件的写入）。 */
export function useGridPreferenceEvents(id: string | undefined, onChange: () => void): void {
  useEffect(() => {
    if (!id) return undefined;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ id?: string }>).detail;
      if (detail?.id === id) onChange();
    };
    window.addEventListener(GRID_PREFS_EVENT, handler);
    return () => window.removeEventListener(GRID_PREFS_EVENT, handler);
  }, [id, onChange]);
}

export interface UseGridPreferencesResult {
  density: GridDensity;
  setDensity: (density: GridDensity) => void;
  hiddenColumnIds: ReadonlySet<string>;
  setHiddenColumnIds: (ids: ReadonlySet<string>) => void;
  /** 清掉这张表的全部偏好（列宽、隐藏列、密度）。 */
  resetView: () => void;
}

/** 页面侧读写密度与隐藏列；defaults 只在用户从没改过时生效。 */
export function useGridPreferences(
  id: string | undefined,
  defaults: { density?: GridDensity; hidden?: readonly string[] } = {},
): UseGridPreferencesResult {
  const defaultDensity = defaults.density ?? "default";
  const defaultHiddenKey = (defaults.hidden ?? []).join("\u0000");
  const readState = useCallback(() => {
    const prefs = readGridPreferences(id);
    return {
      density: prefs.density ?? defaultDensity,
      hidden: new Set(prefs.hidden ?? (defaultHiddenKey ? defaultHiddenKey.split("\u0000") : [])),
    };
  }, [defaultDensity, defaultHiddenKey, id]);

  const [state, setState] = useState(readState);
  const reload = useCallback(() => setState(readState()), [readState]);
  useGridPreferenceEvents(id, reload);

  const setDensity = useCallback(
    (density: GridDensity) => {
      setState((prev) => ({ ...prev, density }));
      writeGridPreferences(id, { density });
    },
    [id],
  );
  const setHiddenColumnIds = useCallback(
    (ids: ReadonlySet<string>) => {
      setState((prev) => ({ ...prev, hidden: new Set(ids) }));
      writeGridPreferences(id, { hidden: [...ids] });
    },
    [id],
  );
  const resetView = useCallback(() => {
    writeGridPreferences(id, null);
    setState({
      density: defaultDensity,
      hidden: new Set(defaultHiddenKey ? defaultHiddenKey.split("\u0000") : []),
    });
  }, [defaultDensity, defaultHiddenKey, id]);

  return {
    density: state.density,
    setDensity,
    hiddenColumnIds: state.hidden,
    setHiddenColumnIds,
    resetView,
  };
}
