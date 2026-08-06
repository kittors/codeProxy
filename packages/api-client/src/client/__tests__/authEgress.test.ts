import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const readSource = (relativePath: string): string =>
  readFileSync(resolve(here, relativePath), "utf8");

/**
 * Structural gate, not a behaviour test.
 *
 * The 401 → refresh → retry path only stays correct while there is exactly one
 * of it. Every previous regression in this area came from a second entry point
 * growing its own `fetch` call (streamSSE and downloadToFile both did, and
 * neither refreshed or guarded against a generation change). A behavioural test
 * cannot catch the *next* such entry point, so the constraint is asserted on
 * the source text instead.
 */
describe("management egress is funnelled through sendWithAuth", () => {
  test("client.ts contains no bare fetch call", () => {
    expect(readSource("../client.ts")).not.toMatch(/(?<!\w)fetch\s*\(/);
  });

  test("client.ts routes requests through the auth-fetch module", () => {
    expect(readSource("../client.ts")).toContain('from "./auth-fetch"');
  });

  test("auth-fetch drains a 401 body before retrying it", () => {
    // Re-sending without draining pins the connection for the whole refresh
    // round-trip; the cancel is easy to drop in a refactor and invisible in
    // tests, because a leaked socket fails nothing locally.
    expect(readSource("../auth-fetch.ts")).toContain("await response.body?.cancel()");
  });

  test("the refresh endpoint is only ever called from the refresher", () => {
    // A second caller would bypass the cross-tab lock and the retry budget, and
    // could land outside the backend grace window — which revokes the session.
    expect(readSource("../auth-fetch.ts")).not.toContain("/v0/auth/refresh");
    expect(readSource("../token-refresher.ts")).toContain("/v0/auth/refresh");
  });
});
