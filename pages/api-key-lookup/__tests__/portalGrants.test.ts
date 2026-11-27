import { describe, expect, test } from "vitest";
import { NO_PORTAL_GRANTS, portalGrantsOf, portalTabAvailable } from "../portalGrants";

describe("portal grants", () => {
  test("privacy masking and billing are there when the backend declares them", () => {
    // 字段缺省按旧后端处理
    expect(portalGrantsOf({})).toEqual({ words: false, privacyMasking: false, billing: false });
    expect(portalGrantsOf({ wordPolicyAllowed: true, privacyMasking: false, billingEnabled: true })).toEqual({
      words: true,
      privacyMasking: false,
      billing: true,
    });
    expect(portalGrantsOf({ privacyMasking: true })).toEqual({
      words: false,
      privacyMasking: true,
      billing: false,
    });
  });

  test("the privacy masking and billing tabs go on an older backend or once signed out", () => {
    const masking = { words: false, privacyMasking: true, billing: false };
    expect(portalTabAvailable("privacy", true, masking)).toBe(true);
    expect(portalTabAvailable("privacy", true, NO_PORTAL_GRANTS)).toBe(false);
    expect(portalTabAvailable("privacy", false, masking)).toBe(false);
    expect(portalTabAvailable("billing", true, masking)).toBe(false);
    expect(portalTabAvailable("billing", true, { words: false, privacyMasking: false, billing: true })).toBe(true);
    expect(portalTabAvailable("billing", false, { words: false, privacyMasking: false, billing: true })).toBe(false);
    expect(portalTabAvailable("words", true, masking)).toBe(false);
    expect(portalTabAvailable("words", true, { words: true, privacyMasking: false, billing: false })).toBe(true);
    expect(portalTabAvailable("usage", false, NO_PORTAL_GRANTS)).toBe(true);
  });
});
