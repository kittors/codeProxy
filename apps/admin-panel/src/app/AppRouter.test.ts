import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const appRoot = resolve(__dirname, "..");
const repoRoot = resolve(__dirname, "../../../..");

const readAppModule = (path: string) => readFileSync(resolve(appRoot, path), "utf8");
const readRepoModule = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

describe("AppRouter", () => {
  test("keeps management routes relative to the /manage basename", () => {
    const source = readAppModule("app/AppRouter.tsx");
    const modelsRoute = readRepoModule("pages/models/route.tsx");
    const accountSecurityRoute = readRepoModule("pages/account-security/route.tsx");
    const identityRoute = readRepoModule("pages/identity-fingerprint/route.tsx");
    const ccSwitchRoute = readRepoModule("pages/ccswitch-import-settings/route.tsx");
    const apiKeyPermissionsRoute = readRepoModule("pages/api-key-permissions/route.tsx");

    expect(source).toContain("pageRoutes");
    expect(modelsRoute).toMatch(/path:\s*"\/models"/);
    expect(modelsRoute).toContain('redirects: [{ from: "/manage/models", to: "/models" }]');
    expect(source).not.toContain('to="/manage/models" replace');

    expect(accountSecurityRoute).toMatch(/path:\s*"\/account-security"/);
    expect(accountSecurityRoute).toContain(
      '{ from: "/manage/identity-fingerprint", to: "/account-security" }',
    );

    expect(identityRoute).toMatch(/path:\s*"\/identity-fingerprint"/);
    expect(identityRoute).toContain(
      'redirects: [{ from: "/manage/identity-fingerprint", to: "/account-security" }]',
    );

    expect(ccSwitchRoute).toContain("CcSwitchImportSettingsPage");
    expect(ccSwitchRoute).toMatch(/path:\s*"\/ccswitch-import-settings"/);
    expect(ccSwitchRoute).toContain(
      'redirects: [{ from: "/manage/ccswitch-import-settings", to: "/ccswitch-import-settings" }]',
    );

    expect(apiKeyPermissionsRoute).toContain("ApiKeyPermissionsPage");
    expect(apiKeyPermissionsRoute).toMatch(/path:\s*"\/api-key-permissions"/);
    expect(apiKeyPermissionsRoute).toContain(
      'redirects: [{ from: "/manage/api-key-permissions", to: "/api-key-permissions" }]',
    );
  });
});
