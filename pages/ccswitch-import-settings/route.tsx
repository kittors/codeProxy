import { preloadablePage } from "../preloadablePage";

const { Page: CcSwitchImportSettingsPage, preload: preloadCcSwitchImportSettingsPage } =
  preloadablePage(() =>
    import("./CcSwitchImportSettingsPage").then((m) => ({
      default: m.CcSwitchImportSettingsPage,
    })),
  );

export const ccswitchImportSettingsRoute = {
  path: "/access/ccswitch-import-settings",
  component: "ccswitch-import-settings",
  element: <CcSwitchImportSettingsPage />,
  auth: true,
  layout: "dashboard",
  nav: { labelKey: "nav.ccswitchImportSettings" },
  redirects: [
    { from: "/ccswitch-import-settings", to: "/access/ccswitch-import-settings" },
    { from: "/manage/ccswitch-import-settings", to: "/access/ccswitch-import-settings" },
  ],
  requiredPermission: "system.config.read",
  preload: preloadCcSwitchImportSettingsPage,
};
