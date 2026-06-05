import { DEFAULT_API_PORT, MANAGEMENT_API_PREFIX } from "@code-proxy/api-client";

export const normalizeApiBase = (input: string): string => {
  let base = input.trim();
  if (!base) {
    return "";
  }

  base = base.replace(/\/?v0\/management\/?$/i, "");
  base = base.replace(/\/+$/, "");

  if (!/^https?:\/\//i.test(base)) {
    base = `http://${base}`;
  }

  return base;
};

export const computeManagementApiBase = (base: string): string => {
  const normalized = normalizeApiBase(base);
  if (!normalized) {
    return "";
  }
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
