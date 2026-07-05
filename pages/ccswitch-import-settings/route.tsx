import { preloadablePage } from "../preloadablePage";

const { Page: CcSwitchImportSettingsPage, preload: preloadCcSwitchImportSettingsPage } =
  preloadablePage(() =>
    import("./CcSwitchImportSettingsPage").then((m) => ({
      default: m.CcSwitchImportSettingsPage,
    })),
  );

export const ccswitchImportSettingsRoute = {
  path: "/ccswitch-import-settings",
  element: <CcSwitchImportSettingsPage />,
  auth: true,
  layout: "dashboard",
  nav: { labelKey: "nav.ccswitchImportSettings" },
  redirects: [{ from: "/manage/ccswitch-import-settings", to: "/ccswitch-import-settings" }],
  preload: preloadCcSwitchImportSettingsPage,
};
