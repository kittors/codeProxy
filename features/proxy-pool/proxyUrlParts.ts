import { isValidHost, isValidPort, type ValidationIssue } from "@code-proxy/ui";

/** 后端（config.ValidateProxyURL 与共享 transport）只认这三种协议。 */
export const PROXY_SCHEMES = ["http", "https", "socks5"] as const;
export type ProxyScheme = (typeof PROXY_SCHEMES)[number];

export interface ProxyUrlParts {
  scheme: ProxyScheme;
  host: string;
  port: string;
  username: string;
  password: string;
}

export const EMPTY_PROXY_PARTS: ProxyUrlParts = {
  scheme: "socks5",
  host: "",
  port: "",
  username: "",
  password: "",
};

export const DEFAULT_PROXY_PORT: Record<ProxyScheme, string> = {
  http: "8080",
  https: "443",
  socks5: "1080",
};

const safeDecode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

/**
 * 把一串代理地址拆成协议 / 主机 / 端口 / 账号 / 密码。
 * 没写协议（例如直接粘贴 `1.2.3.4:1080`）时沿用 `fallbackScheme`；
 * 协议不是 http / https / socks5 时 `scheme` 返回 null，交给调用方提示。
 */
export function parseProxyUrl(
  raw: string,
  fallbackScheme: ProxyScheme = "socks5",
): { parts: ProxyUrlParts; scheme: ProxyScheme | null } | null {
  const text = raw.trim();
  if (!text) return null;
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text);
  const candidate = hasScheme ? text : `${fallbackScheme}://${text}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  const scheme = url.protocol.replace(/:$/, "").toLowerCase();
  const known = (PROXY_SCHEMES as readonly string[]).includes(scheme) ? (scheme as ProxyScheme) : null;
  if (!url.hostname) return null;
  return {
    scheme: known,
    parts: {
      scheme: known ?? fallbackScheme,
      host: url.hostname,
      port: url.port,
      username: safeDecode(url.username),
      password: safeDecode(url.password),
    },
  };
}

/**
 * 拼回 URL。账号密码做百分号编码——密码里带 `@`、`:`、`/` 时，手敲 URL 是最容易错的地方，
 * 后端用 Go 的 url.Parse 会自动解码，所以这里编码后语义不变。没填主机时返回空串（不使用代理）。
 */
export function composeProxyUrl(parts: ProxyUrlParts): string {
  const host = parts.host.trim();
  if (!host) return "";
  const bracketed = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
  const username = parts.username.trim();
  const auth = username
    ? `${encodeURIComponent(username)}${parts.password ? `:${encodeURIComponent(parts.password)}` : ""}@`
    : "";
  const port = parts.port.trim();
  return `${parts.scheme}://${auth}${bracketed}${port ? `:${port}` : ""}`;
}

/** 预览用：密码打码（用户名已编码，第一个 @ 就是账号与主机的分隔符）。 */
export function maskedProxyUrl(parts: ProxyUrlParts): string {
  const url = composeProxyUrl({ ...parts, password: "" });
  if (!url || !parts.password || !parts.username.trim()) return url;
  return url.replace("@", ":••••@");
}

export type ProxyPartIssues = Partial<Record<"host" | "port" | "username", ValidationIssue>>;

/**
 * 逐项校验。`required` 时必须填主机；可选时全部留空表示「不使用代理」。
 * SOCKS5 没有默认端口（拨号时缺端口直接失败），必须填；HTTP / HTTPS 不填走 80 / 443。
 */
export function validateProxyParts(parts: ProxyUrlParts, required: boolean): ProxyPartIssues {
  const issues: ProxyPartIssues = {};
  const host = parts.host.trim();
  const anything = Boolean(host || parts.port.trim() || parts.username.trim() || parts.password);
  if (!host) {
    if (required || anything) issues.host = { key: "required" };
  } else if (!isValidHost(host)) {
    issues.host = { key: "host" };
  }
  const port = parts.port.trim();
  if (port) {
    if (!isValidPort(port)) issues.port = { key: "port" };
  } else if (host && parts.scheme === "socks5") {
    issues.port = { key: "proxy_port_required" };
  }
  if (parts.password && !parts.username.trim()) issues.username = { key: "proxy_username_required" };
  return issues;
}
