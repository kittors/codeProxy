import { describe, expect, test } from "vitest";
import {
  coolingModeFromAuthJson,
  coolingModeFromOverride,
  coolingOverrideField,
  writeCoolingModeToAuthJson,
} from "../coolingMode";

describe("cooling mode", () => {
  test("maps the backend override to the form and back", () => {
    expect(coolingModeFromOverride(true)).toBe("off");
    expect(coolingModeFromOverride(false)).toBe("on");
    expect(coolingModeFromOverride(undefined)).toBe("");
    expect(coolingOverrideField("off")).toEqual({ disableCooling: true });
    expect(coolingOverrideField("on")).toEqual({ disableCooling: false });
    expect(coolingOverrideField("")).toEqual({});
  });

  // The backend reads disable_cooling with parseBoolAny, falling back to the
  // legacy disable-cooling key; the form has to show what the backend applies.
  test.each([
    [{ disable_cooling: true }, "off"],
    [{ disable_cooling: false }, "on"],
    [{ disable_cooling: "true" }, "off"],
    [{ disable_cooling: "0" }, "on"],
    [{ disable_cooling: 1 }, "off"],
    [{ "disable-cooling": "false" }, "on"],
    [{ disable_cooling: false, "disable-cooling": true }, "on"],
    [{ disable_cooling: "maybe" }, ""],
    [{}, ""],
  ] as const)("reads %j from an account as %s", (json, mode) => {
    expect(coolingModeFromAuthJson({ ...json })).toBe(mode);
  });

  test("writes the choice to an account and drops the legacy key", () => {
    const json: Record<string, unknown> = { email: "a@example.com", "disable-cooling": true };
    writeCoolingModeToAuthJson(json, "on");
    expect(json).toEqual({ email: "a@example.com", disable_cooling: false });

    writeCoolingModeToAuthJson(json, "");
    expect(json).toEqual({ email: "a@example.com" });

    // Clearing has to remove the legacy key too, or the backend keeps reading it.
    const legacy: Record<string, unknown> = { "disable-cooling": "true" };
    writeCoolingModeToAuthJson(legacy, "");
    expect(coolingModeFromAuthJson(legacy)).toBe("");
  });
});
