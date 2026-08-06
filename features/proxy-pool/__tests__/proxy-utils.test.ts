import { describe, expect, test } from "vitest";
import { slugifyProxyID, uniqueProxyID } from "../proxy-utils";

describe("slugifyProxyID", () => {
  test("uses ascii name when present", () => {
    expect(slugifyProxyID("HK Proxy", "socks5://1.1.1.1:1080")).toBe("hk-proxy");
  });

  test("does not collapse CJK-only names to bare ip", () => {
    const la = slugifyProxyID("洛杉矶 ip", "socks5://user:pass@1.2.3.4:1080");
    const home = slugifyProxyID("住宅 ip", "socks5://user:pass@5.6.7.8:1080");
    expect(la).not.toBe("ip");
    expect(home).not.toBe("ip");
    expect(la).not.toBe(home);
    expect(la).toMatch(/^proxy-/);
    expect(home).toMatch(/^proxy-/);
  });
});

describe("uniqueProxyID", () => {
  test("appends suffix when id already exists", () => {
    const id = uniqueProxyID("ip", [{ id: "ip", name: "old", url: "socks5://1.1.1.1:1080", enabled: true }]);
    expect(id).toBe("ip-2");
  });

  test("keeps candidate when free", () => {
    expect(uniqueProxyID("la", [])).toBe("la");
  });
});
