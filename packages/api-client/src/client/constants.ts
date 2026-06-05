export const MANAGEMENT_API_PREFIX = "/v0/management";
export const DEFAULT_API_PORT = 8317;
export const REQUEST_TIMEOUT_MS = 30000;
export const AUTH_STORAGE_KEY = "code-proxy-admin-auth";
export const VERSION_HEADER_KEYS = ["x-cpa-version", "x-server-version"];
export const BUILD_DATE_HEADER_KEYS = ["x-cpa-build-date", "x-server-build-date"];

export const normalizeApiBase = (input: string): string => {
  let base = input.trim();
  if (!base) return "";

  base = base.replace(/\/?v0\/management\/?$/i, "");
  base = base.replace(/\/+$/, "");

  if (!/^https?:\/\//i.test(base)) {
    base = `http://${base}`;
  }

  return base;
};

export const computeManagementApiBase = (base: string): string => {
  const normalized = normalizeApiBase(base);
  if (!normalized) return "";
  return `${normalized}${MANAGEMENT_API_PREFIX}`;
};

export const detectApiBaseFromLocation = (): string => {
  try {
    const { protocol, hostname, port } = window.location;
    const suffix = port ? `:${port}` : "";
    return normalizeApiBase(`${protocol}//${hostname}${suffix}`);
  } catch {
    return normalizeApiBase(`http://localhost:${DEFAULT_API_PORT}`);
  }
};
