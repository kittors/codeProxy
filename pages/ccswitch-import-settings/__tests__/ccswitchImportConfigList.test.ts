import { describe, expect, test } from "vitest";
import { createCcSwitchRoutePath } from "@code-proxy/domain/ccswitch/ccswitchImportConfigList";

describe("ccswitchImportConfigList", () => {
  test("creates distinct CC Switch route paths from generated config IDs", () => {
    const routeA = createCcSwitchRoutePath("kimicode", "ccswitch-1770000000000-alpha123");
    const routeB = createCcSwitchRoutePath("kimicode", "ccswitch-1770000000000-bravo456");

    expect(routeA).toBe("/kimicode/cs_alpha123");
    expect(routeB).toBe("/kimicode/cs_bravo456");
    expect(routeA).not.toBe(routeB);
  });
});
