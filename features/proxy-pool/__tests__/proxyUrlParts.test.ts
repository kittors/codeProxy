import { describe, expect, test } from "vitest";
import {
  composeProxyUrl,
  maskedProxyUrl,
  parseProxyUrl,
  validateProxyParts,
  type ProxyUrlParts,
} from "../proxyUrlParts";

/*
 * 结构化代理输入会把已保存的地址拆开显示、改完再拼回去。拼回去的字符串必须和后端
 * （Go 的 url.Parse）理解的是同一个代理，否则用户只是打开编辑框点了保存，代理就被悄悄改坏。
 */
const roundTrip = (raw: string) => {
  const parsed = parseProxyUrl(raw);
  expect(parsed).not.toBeNull();
  return composeProxyUrl(parsed!.parts);
};

describe("parseProxyUrl / composeProxyUrl round trip", () => {
  test.each([
    "socks5://203.0.113.7:1080",
    "http://proxy.example.com:8080",
    "http://user:secret@proxy.example.com:8080",
    "socks5://user:secret@203.0.113.7:1080",
    // 账号里只有 token、没有密码（不少住宅代理这样鉴权）。
    "http://token123@proxy.example.com:3128",
    // 已经百分号编码过的特殊字符：@ : / + % 拼回去仍是同样的编码。
    "socks5://user%2Bteam:p%40ss%3Aw%2Fd%25@203.0.113.7:1080",
    "socks5://[2001:db8::1]:1080",
    "http://proxy.example.com",
  ])("%s comes back unchanged", (raw) => {
    expect(roundTrip(raw)).toBe(raw);
  });

  test("decodes credentials for display and encodes them again on the way out", () => {
    const parsed = parseProxyUrl("socks5://user%2Bteam:p%40ss%3Aw%2Fd@203.0.113.7:1080");
    expect(parsed?.parts).toMatchObject({ username: "user+team", password: "p@ss:w/d" });
  });

  test("an unencoded @ in the password means the same proxy as Go reads it", () => {
    // Go 的 url.Parse 以最后一个 @ 分隔账号与主机；拼回时把密码里的 @ 编码，语义不变。
    const parsed = parseProxyUrl("http://user:p@ss@proxy.example.com:8080");
    expect(parsed?.parts).toMatchObject({
      username: "user",
      password: "p@ss",
      host: "proxy.example.com",
      port: "8080",
    });
    expect(composeProxyUrl(parsed!.parts)).toBe("http://user:p%40ss@proxy.example.com:8080");
  });

  test("default ports and a trailing slash drop out without changing the proxy", () => {
    expect(roundTrip("https://proxy.example.com:443")).toBe("https://proxy.example.com");
    expect(roundTrip("http://proxy.example.com:80/")).toBe("http://proxy.example.com");
    // SOCKS5 没有默认端口，端口必须原样保留。
    expect(roundTrip("socks5://proxy.example.com:1080/")).toBe("socks5://proxy.example.com:1080");
  });

  test("a pasted address without a scheme uses the selected protocol", () => {
    expect(parseProxyUrl("203.0.113.7:1080")?.parts).toMatchObject({
      scheme: "socks5",
      host: "203.0.113.7",
      port: "1080",
    });
    expect(parseProxyUrl("203.0.113.7:3128", "http")?.parts.scheme).toBe("http");
  });

  test("scheme case is normalised and unsupported schemes are reported, not guessed", () => {
    expect(roundTrip("SOCKS5://203.0.113.7:1080")).toBe("socks5://203.0.113.7:1080");
    const unknown = parseProxyUrl("socks5h://203.0.113.7:1080");
    expect(unknown?.scheme).toBeNull();
    expect(parseProxyUrl("not a url at all")).toBeNull();
    expect(parseProxyUrl("   ")).toBeNull();
  });

  test("an empty host means no proxy", () => {
    expect(
      composeProxyUrl({ scheme: "socks5", host: " ", port: "1080", username: "", password: "" }),
    ).toBe("");
  });

  test("the preview masks the password but keeps everything else readable", () => {
    const parts: ProxyUrlParts = {
      scheme: "http",
      host: "proxy.example.com",
      port: "8080",
      username: "user@team",
      password: "secret",
    };
    expect(maskedProxyUrl(parts)).toBe("http://user%40team:••••@proxy.example.com:8080");
    expect(maskedProxyUrl({ ...parts, password: "" })).toBe(
      "http://user%40team@proxy.example.com:8080",
    );
  });
});

describe("validateProxyParts", () => {
  const parts = (overrides: Partial<ProxyUrlParts>): ProxyUrlParts => ({
    scheme: "socks5",
    host: "203.0.113.7",
    port: "1080",
    username: "",
    password: "",
    ...overrides,
  });

  test("a complete address passes", () => {
    expect(validateProxyParts(parts({}), true)).toEqual({});
  });

  test("SOCKS5 needs a port; HTTP and HTTPS fall back to 80 / 443", () => {
    expect(validateProxyParts(parts({ port: "" }), true).port?.key).toBe("proxy_port_required");
    expect(validateProxyParts(parts({ scheme: "http", port: "" }), true)).toEqual({});
    expect(validateProxyParts(parts({ scheme: "https", port: "" }), true)).toEqual({});
  });

  test("bad hosts and ports are named", () => {
    expect(validateProxyParts(parts({ host: "256.0.0.1" }), true).host?.key).toBe("host");
    expect(validateProxyParts(parts({ host: "bad host" }), true).host?.key).toBe("host");
    expect(validateProxyParts(parts({ port: "70000" }), true).port?.key).toBe("port");
    expect(validateProxyParts(parts({ port: "10a" }), true).port?.key).toBe("port");
  });

  test("a password needs a username", () => {
    expect(validateProxyParts(parts({ password: "secret" }), true).username?.key).toBe(
      "proxy_username_required",
    );
  });

  test("optional fields may stay empty, but half-filled ones are flagged", () => {
    const empty = parts({ host: "", port: "" });
    expect(validateProxyParts(empty, false)).toEqual({});
    expect(validateProxyParts(empty, true).host?.key).toBe("required");
    expect(validateProxyParts(parts({ host: "", port: "1080" }), false).host?.key).toBe("required");
  });
});
