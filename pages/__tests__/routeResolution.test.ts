import { afterEach, describe, expect, test, vi } from "vitest";
import { pageRoutes, preloadPageRoute } from "../registry";
import { LEGACY_PREFIX_REDIRECTS, matchPageRoute, resolveLegacyLocation } from "../routeResolution";

const at = (path: string) => {
  const url = new URL(path, "http://panel.test");
  return { pathname: url.pathname, search: url.search, hash: url.hash };
};
const resolve = (path: string, embedPaths: string[] = []) =>
  resolveLegacyLocation(at(path), pageRoutes, embedPaths);
const href = (path: string) => {
  const target = resolve(path);
  return target ? `${target.pathname}${target.search}${target.hash}` : null;
};

describe("resolveLegacyLocation", () => {
  test("sends the auth-files era addresses to the AI accounts page", () => {
    expect(href("/auth-files")).toBe("/access/ai-accounts");
    // AuthFilesRedirect 以前就把查询串原样带过去
    expect(href("/auth-files?tab=alias&q=x")).toBe("/access/ai-accounts?tab=alias&q=x");
    expect(href("/auth-files/oauth-excluded")).toBe("/access/ai-accounts?tab=excluded");
    expect(href("/auth-files/oauth-model-alias?x=1")).toBe("/access/ai-accounts?tab=alias");
    expect(href("/identity-fingerprint")).toBe("/access/ai-accounts");
    expect(href("/manage/identity-fingerprint")).toBe("/access/ai-accounts");
  });

  test("matches legacy paths the way routes match: case and a trailing slash do not matter", () => {
    expect(href("/Auth-Files/")).toBe("/access/ai-accounts");
  });

  test("redirects bare /access/api-keys to user accounts, but keeps the scoped key manager", () => {
    expect(href("/access/api-keys")).toBe("/access/end-users");
    expect(href("/access/api-keys?endUserId=%20")).toBe("/access/end-users");
    expect(href("/access/api-keys?endUserId=eu-1")).toBeNull();
  });

  test("keeps the deep-link suffix, query and hash under legacy prefixes", () => {
    expect(href("/ai-providers/openai?x=1#top")).toBe("/access/ai-providers/openai?x=1#top");
    expect(href("/monitor/request-logs/abc")).toBe("/runtime/request-logs/abc");
    expect(href("/monitor")).toBe("/runtime/monitor");
    expect(href("/monitor/abc")).toBe("/runtime/monitor/abc");
    expect(href("/config")).toBe("/system/config");
  });

  test("sends the panel root to the dashboard", () => {
    expect(href("/")).toBe("/dashboard");
  });

  test("leaves current page addresses alone", () => {
    for (const route of pageRoutes.filter((r) => r.auth)) {
      const conditional = route.redirects?.some((rd) => rd.when && rd.from === route.path);
      if (conditional) continue;
      expect(resolve(route.path), route.path).toBeNull();
    }
    expect(href("/access/ai-providers/openai")).toBeNull();
  });

  test("lets a configured embed menu win over a legacy prefix, as the old route table did", () => {
    expect(href("/config/embedded-docs")).toBe("/system/config/embedded-docs");
    expect(resolve("/config/embedded-docs", ["/config/embedded-docs"])).toBeNull();
  });

  test("every declared legacy address redirects, and lands on an address that is already current", () => {
    for (const route of pageRoutes.filter((r) => r.auth)) {
      for (const redirect of route.redirects ?? []) {
        const target = resolve(redirect.from);
        expect(target, redirect.from).not.toBeNull();
        expect(
          resolveLegacyLocation(target!, pageRoutes),
          `${redirect.from} → ${redirect.to}`,
        ).toBeNull();
      }
    }
    for (const { fromPrefix } of LEGACY_PREFIX_REDIRECTS) {
      const target = resolve(`${fromPrefix}/deep/link`);
      expect(target, fromPrefix).not.toBeNull();
      expect(resolveLegacyLocation(target!, pageRoutes), fromPrefix).toBeNull();
    }
  });
});

describe("matchPageRoute", () => {
  test("finds the page that renders a current address, including wildcard sub-paths", () => {
    expect(matchPageRoute("/access/ai-accounts", pageRoutes)?.path).toBe("/access/ai-accounts");
    expect(matchPageRoute("/access/ai-providers/openai", pageRoutes)?.path).toBe(
      "/access/ai-providers",
    );
    expect(matchPageRoute("/access/ai-accounts/unknown", pageRoutes)).toBeNull();
  });
});

describe("preloadPageRoute", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("warms the page a legacy address lands on", async () => {
    const endUsers = pageRoutes.find((r) => r.path === "/access/end-users")!;
    const apiKeys = pageRoutes.find((r) => r.path === "/access/api-keys")!;
    const endUsersPreload = vi.spyOn(endUsers, "preload").mockResolvedValue(undefined);
    const apiKeysPreload = vi.spyOn(apiKeys, "preload").mockResolvedValue(undefined);

    await preloadPageRoute("/api-keys");

    expect(endUsersPreload).toHaveBeenCalledTimes(1);
    expect(apiKeysPreload).not.toHaveBeenCalled();
  });
});
