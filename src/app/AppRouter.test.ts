import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const root = resolve(__dirname, "..");

const readModule = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("AppRouter", () => {
  test("keeps management routes relative to the /manage basename", () => {
    const source = readModule("app/AppRouter.tsx");

    expect(source).toMatch(/<Route\s+path="\/models"\s+element=\{<ModelsPage \/>\}\s*\/>/s);
    expect(source).toMatch(
      /path="\/manage\/models"[\s\S]*?element=\{<Navigate to="\/models" replace \/>\}/,
    );
    expect(source).not.toContain('to="/manage/models" replace');

    expect(source).toMatch(
      /<Route\s+path="\/identity-fingerprint"\s+element=\{<IdentityFingerprintPage \/>\}\s*\/>/s,
    );
    expect(source).toMatch(
      /path="\/manage\/identity-fingerprint"[\s\S]*?element=\{<Navigate to="\/identity-fingerprint" replace \/>\}/,
    );

    expect(source).toContain("CcSwitchImportSettingsPage");
    expect(source).toMatch(
      /<Route\s+path="\/ccswitch-import-settings"\s+element=\{<CcSwitchImportSettingsPage \/>\}\s*\/>/s,
    );
    expect(source).toMatch(
      /path="\/manage\/ccswitch-import-settings"[\s\S]*?element=\{<Navigate to="\/ccswitch-import-settings" replace \/>\}/,
    );
  });
});
