import { describe, expect, test } from "vitest";
import { NO_PORTAL_GRANTS, portalGrantsOf, portalTabAvailable } from "../portalGrants";

describe("portal grants", () => {
  test("an older backend says nothing about privacy masking, which is not the same as not allowed", () => {
    expect(portalGrantsOf({})).toEqual({ words: false, privacyMasking: null });
    expect(portalGrantsOf({ wordPolicyAllowed: true, privacyMaskingAllowed: null })).toEqual({
      words: true,
      privacyMasking: null,
    });
    expect(portalGrantsOf({ privacyMaskingAllowed: false })).toEqual({
      words: false,
      privacyMasking: false,
    });
    expect(portalGrantsOf({ privacyMaskingAllowed: true })).toEqual({
      words: false,
      privacyMasking: true,
    });
  });

  test("the privacy masking tab stays for a read-only account and goes on an older backend or signed out", () => {
    const readOnly = { words: false, privacyMasking: false };
    expect(portalTabAvailable("privacy", true, readOnly)).toBe(true);
    expect(portalTabAvailable("privacy", true, NO_PORTAL_GRANTS)).toBe(false);
    expect(portalTabAvailable("privacy", false, readOnly)).toBe(false);
    expect(portalTabAvailable("words", true, readOnly)).toBe(false);
    expect(portalTabAvailable("words", true, { words: true, privacyMasking: null })).toBe(true);
    expect(portalTabAvailable("usage", false, NO_PORTAL_GRANTS)).toBe(true);
  });
});
