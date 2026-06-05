export const normalizeProviderKey = (value: string): string => value.trim().toLowerCase();

export const matchesModelPattern = (modelId: string, pattern: string): boolean => {
  if (pattern === "*" || pattern === modelId) return true;
  if (pattern.endsWith("*") && modelId.startsWith(pattern.slice(0, -1))) return true;
  if (pattern.startsWith("*") && modelId.endsWith(pattern.slice(1))) return true;
  return false;
};

import type { AuthFileItem } from "../auth-files/types";

export const resolveFileType = (file: AuthFileItem): string => {
  const candidate = normalizeProviderKey(
    String(file.type || file.provider || file.display_name || "other"),
  );
  if (candidate === "codex") return "codex";
  if (candidate === "kimi") return "kimi";
  return "other";
};

export const AUTH_FILES_MODEL_OWNER_GROUP_MAP_KEY = "authFilesPage.modelOwnerGroupMap.v1";

export type AuthFilesModelOwnerGroupMap = Record<string, string>;

const sanitizeModelOwnerGroupMap = (value: unknown): AuthFilesModelOwnerGroupMap => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const output: AuthFilesModelOwnerGroupMap = {};
  for (const [key, val] of Object.entries(value)) {
    if (typeof val === "string") output[key] = val;
  }
  return output;
};

export const readAuthFilesModelOwnerGroupMap = (): AuthFilesModelOwnerGroupMap => {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(AUTH_FILES_MODEL_OWNER_GROUP_MAP_KEY);
    if (!raw) return {};
    return sanitizeModelOwnerGroupMap(JSON.parse(raw) as unknown);
  } catch {
    return {};
  }
};
