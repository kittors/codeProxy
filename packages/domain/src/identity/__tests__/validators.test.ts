import { describe, expect, test } from "vitest";
import {
  normalizeUsername,
  utf8ByteLength,
  validateDisplayName,
  validatePassword,
  validateUsername,
} from "../validators";

describe("identity validators", () => {
  test("normalizeUsername trims and lowercases", () => {
    expect(normalizeUsername("  Admin.User  ")).toBe("admin.user");
  });

  test("utf8ByteLength counts multibyte characters", () => {
    expect(utf8ByteLength("abc")).toBe(3);
    expect(utf8ByteLength("你好")).toBe(6);
  });

  test("validateUsername accepts identifier charset", () => {
    expect(validateUsername("alice_01").ok).toBe(true);
    expect(validateUsername("user.name-x@t").ok).toBe(true);
  });

  test("validateUsername rejects empty invalid and overlong", () => {
    expect(validateUsername("  ").ok).toBe(false);
    expect(validateUsername("中文").ok).toBe(false);
    expect(validateUsername("bad space").ok).toBe(false);
    expect(validateUsername("a".repeat(129)).ok).toBe(false);
  });

  test("validateDisplayName", () => {
    expect(validateDisplayName("Alice").ok).toBe(true);
    expect(validateDisplayName("  ").ok).toBe(false);
    expect(validateDisplayName("你".repeat(64)).ok).toBe(false);
  });

  test("validatePassword policy", () => {
    expect(validatePassword("too-short").ok).toBe(false);
    expect(validatePassword("alllowercase!").ok).toBe(false);
    expect(validatePassword("ALLUPPERCASE!1").ok).toBe(false);
    expect(validatePassword("NoSpecialChar1").ok).toBe(false);
    expect(validatePassword("Correct-Horse-1!").ok).toBe(true);
  });
});
