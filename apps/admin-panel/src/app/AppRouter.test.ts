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
    expect(modelsRoute).toMatch(/path:\s*"\/models\/catalog"/);
    expect(modelsRoute).toContain('{ from: "/manage/models", to: "/models/catalog" }');
    expect(source).not.toContain('to="/manage/models" replace');

    expect(accountSecurityRoute).toMatch(/path:\s*"\/system\/account-security"/);
    expect(accountSecurityRoute).toContain(
      '{ from: "/manage/identity-fingerprint", to: "/system/account-security" }',
    );

    expect(identityRoute).toMatch(/path:\s*"\/identity-fingerprint"/);
    expect(identityRoute).toContain(
      'redirects: [{ from: "/manage/identity-fingerprint", to: "/system/account-security" }]',
    );

    expect(ccSwitchRoute).toContain("CcSwitchImportSettingsPage");
    expect(ccSwitchRoute).toMatch(/path:\s*"\/access\/ccswitch-import-settings"/);
    expect(ccSwitchRoute).toContain(
      '{ from: "/manage/ccswitch-import-settings", to: "/access/ccswitch-import-settings" }',
    );

    expect(apiKeyPermissionsRoute).toContain("ApiKeyPermissionsPage");
    expect(apiKeyPermissionsRoute).toMatch(/path:\s*"\/system\/api-key-permissions"/);
    expect(apiKeyPermissionsRoute).toContain(
      '{ from: "/manage/api-key-permissions", to: "/system/api-key-permissions" }',
    );
  });

  test("keeps the HTML app loader as the only initial page loader", () => {
    const routerSource = readAppModule("app/AppRouter.tsx");
    const protectedRouteSource = readAppModule("app/guards/ProtectedRoute.tsx");
    const mainSource = readAppModule("main.tsx");
    const manageEntrySource = readAppModule("manage-entry.tsx");

    expect(mainSource).toContain("dismissAppLoader(true)");
    expect(manageEntrySource).toContain("dismissAppLoader(true)");
    expect(routerSource).toContain("const RouteFallback = () => null");
    expect(routerSource).not.toContain("PageLoader");
    expect(routerSource).not.toContain('variant="initial"');
    expect(routerSource).not.toContain('variant="inline"');
    expect(protectedRouteSource).toContain("if (hasAppLoader()) return null");
  });
});
