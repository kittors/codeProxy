export const MANAGEMENT_API_PREFIX = "/v0/management";
export const DEFAULT_API_PORT = 8317;
export const REQUEST_TIMEOUT_MS = 30000;
export const AUTH_STORAGE_KEY = "code-proxy-admin-auth";
export const AUTH_PERSIST_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const VERSION_HEADER_KEYS = ["x-cpa-version", "x-server-version"];
export const BUILD_DATE_HEADER_KEYS = ["x-cpa-build-date", "x-server-build-date"];

const isLoopbackHost = (host: string): boolean => {
  const normalized = host.trim().toLowerCase().replace(/^\[|\]$/g, "");
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "0:0:0:0:0:0:0:1"
  );
};

// Scheme-less remote hosts default to https so admin passwords are not sent in cleartext.
// Loopback keeps http for local dev (vite / native binary on 8317).
const withDefaultScheme = (input: string): string => {
  if (/^https?:\/\//i.test(input)) return input;
  // Parse host from authority without inventing a scheme first (IPv6: [::1]:8317).
  const authority = input.split("/")[0] ?? "";
  let host = authority;
  if (authority.startsWith("[")) {
    const end = authority.indexOf("]");
    host = end >= 0 ? authority.slice(1, end) : authority;
  } else {
    host = authority.split(":")[0] ?? "";
  }
  const scheme = isLoopbackHost(host) ? "http" : "https";
  return `${scheme}://${input}`;
};

export const normalizeApiBase = (input: string): string => {
  let base = input.trim();
  if (!base) return "";

  base = withDefaultScheme(base);

  try {
    const url = new URL(base);
    url.hash = "";
    url.search = "";

    const normalizedPath = url.pathname.replace(/\/+$/, "");
    const lowerPath = normalizedPath.toLowerCase();
    const managementIndex = lowerPath.search(/\/v0\/management(?:\/|$)/);
    const manageIndex = lowerPath.search(/\/manage(?:\/|$)/);

    if (managementIndex >= 0) {
      url.pathname = normalizedPath.slice(0, managementIndex) || "/";
    } else if (manageIndex >= 0) {
      url.pathname = normalizedPath.slice(0, manageIndex) || "/";
    }

    return url.toString().replace(/\/+$/, "");
  } catch {
    return base.replace(/\/?v0\/management\/?$/i, "").replace(/\/+$/, "");
  }
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
