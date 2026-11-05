import { describe, expect, test } from "vitest";
import { NO_PORTAL_GRANTS, portalGrantsOf, portalTabAvailable } from "../portalGrants";

describe("portal grants", () => {
  test("privacy masking is there whenever the backend says anything about it, allowed or not", () => {
    expect(portalGrantsOf({})).toEqual({ words: false, privacyMasking: false });
    expect(portalGrantsOf({ wordPolicyAllowed: true, privacyMaskingAllowed: null })).toEqual({
      words: true,
      privacyMasking: false,
    });
    // 门户一律只读：允不允许自设都一样有这个标签
    expect(portalGrantsOf({ privacyMaskingAllowed: false })).toEqual({
      words: false,
      privacyMasking: true,
    });
    expect(portalGrantsOf({ privacyMaskingAllowed: true })).toEqual({
      words: false,
      privacyMasking: true,
    });
  });

  test("the privacy masking tab goes on an older backend or once signed out", () => {
    const masking = { words: false, privacyMasking: true };
    expect(portalTabAvailable("privacy", true, masking)).toBe(true);
    expect(portalTabAvailable("privacy", true, NO_PORTAL_GRANTS)).toBe(false);
    expect(portalTabAvailable("privacy", false, masking)).toBe(false);
    expect(portalTabAvailable("words", true, masking)).toBe(false);
    expect(portalTabAvailable("words", true, { words: true, privacyMasking: false })).toBe(true);
    expect(portalTabAvailable("usage", false, NO_PORTAL_GRANTS)).toBe(true);
  });
});
