import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@code-proxy/i18n";
import { ThemeProvider, ToastProvider } from "@code-proxy/ui";
import type { PortalGrants } from "../../portalGrants";
import type { ApiKeyLookupTab } from "../LookupResultsToolbar";
import { PortalSelfServiceTabs } from "../PortalSelfServiceTabs";

const portal = vi.hoisted(() => ({
  getSummary: vi.fn(),
  listRecords: vi.fn(),
  getRecord: vi.fn(),
  getSettings: vi.fn(),
  putSettings: vi.fn(),
  resetSettings: vi.fn(),
  preview: vi.fn(),
}));

vi.mock("@code-proxy/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@code-proxy/api-client")>()),
  portalPrivacyMaskingApi: portal,
}));

// 敏感词标签有自己的单测，这里只看两个标签怎么挂
vi.mock("../PortalWordsTab", () => ({ PortalWordsTab: () => <p>sensitive words</p> }));

const SUMMARY = {
  days: [],
  places: 0,
  distinct: 0,
  requests: 0,
  blocked: 0,
  warned: 0,
  kinds: [],
  clients: [],
  channels: [],
  values: [],
};

const ui = (activeTab: ApiKeyLookupTab, grants: PortalGrants) => (
  <ThemeProvider>
    <ToastProvider>
      <PortalSelfServiceTabs activeTab={activeTab} grants={grants} />
    </ToastProvider>
  </ThemeProvider>
);

const asked = () =>
  portal.getSummary.mock.calls.length +
  portal.listRecords.mock.calls.length +
  portal.getSettings.mock.calls.length;

describe("the portal's self-service tabs", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    portal.getSummary.mockResolvedValue(SUMMARY);
    portal.listRecords.mockResolvedValue({ items: [] });
    portal.getSettings.mockResolvedValue({
      policy: {
        secrets: false,
        personal: false,
        kinds: {},
        words: [],
        words_any_case: false,
        words_whole: false,
        rules: [],
        allow: [],
        actions: {},
      },
      own: false,
      allowed: false,
      enforced: [],
      portal_default_allowed: false,
      persistent: true,
    });
  });

  test("privacy masking asks for nothing until its tab is opened, then stays mounted behind other tabs", async () => {
    const grants: PortalGrants = { words: true, privacyMasking: false };
    const view = render(ui("usage", grants));
    expect(screen.getByText("sensitive words")).not.toBeVisible();
    expect(asked()).toBe(0);

    view.rerender(ui("privacy", grants));
    expect(await screen.findByRole("tab", { name: "My settings" })).toBeVisible();
    expect(portal.listRecords).toHaveBeenCalledTimes(1);
    expect(portal.getSettings).toHaveBeenCalledTimes(1);

    // 切走只是藏起来：再回来不重新挂，不重新读
    view.rerender(ui("usage", grants));
    expect(screen.getByRole("tab", { name: "My settings", hidden: true })).not.toBeVisible();
    view.rerender(ui("privacy", grants));
    expect(screen.getByRole("tab", { name: "My settings" })).toBeVisible();
    expect(portal.getSettings).toHaveBeenCalledTimes(1);
  });

  test("an older backend gets no privacy masking at all", () => {
    render(ui("privacy", { words: false, privacyMasking: null }));
    expect(screen.queryByRole("tab", { name: "My settings" })).not.toBeInTheDocument();
    expect(screen.queryByText("sensitive words")).not.toBeInTheDocument();
    expect(asked()).toBe(0);
  });
});
