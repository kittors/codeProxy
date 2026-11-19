import { render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@code-proxy/i18n";
import type { PortalAccessFreeze } from "@code-proxy/api-client";
import { PortalAccessFreezes } from "../PortalAccessFreezes";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
}));

vi.mock("@code-proxy/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@code-proxy/api-client")>()),
  portalAccessFreezesApi: { list: mocks.list },
}));

const codex: PortalAccessFreeze = {
  provider: "codex",
  provider_name: "Codex",
  reason_code: "cyber_policy",
  model: "gpt-6.1-sol",
  frozen_at: "2026-11-13T02:00:00Z",
  notice:
    "Access to Codex is frozen for this account since 2026-11-13 10:00 +08:00. 本账号的 Codex 使用权限已于 2026-11-13 10:00 +08:00 冻结。",
};

describe("PortalAccessFreezes", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    mocks.list.mockResolvedValue([codex]);
  });

  afterEach(async () => {
    await i18n.changeLanguage("zh-CN");
  });

  test("says which upstream is frozen, since when, for what model, and shows the gateway's own notice", async () => {
    render(<PortalAccessFreezes enabled accountId="user-1" />);

    const card = await screen.findByTestId("portal-access-freezes");
    expect(within(card).getByText("Frozen upstreams")).toBeInTheDocument();
    expect(within(card).getByText("Codex")).toBeInTheDocument();
    expect(card).toHaveTextContent(`Frozen ${new Date(codex.frozen_at).toLocaleString("en")}`);
    expect(card).toHaveTextContent("Triggering model gpt-6.1-sol");
    expect(card).toHaveTextContent("本账号的 Codex 使用权限已于 2026-11-13 10:00 +08:00 冻结。");
    expect(mocks.list).toHaveBeenCalledTimes(1);
  });

  test("an upstream the operator named is shown as 'other upstream', one line per freeze", async () => {
    mocks.list.mockResolvedValue([
      codex,
      { ...codex, provider: "", provider_name: "", notice: "Access to this upstream is frozen." },
    ]);
    render(<PortalAccessFreezes enabled accountId="user-1" />);

    const card = await screen.findByTestId("portal-access-freezes");
    expect(within(card).getAllByRole("listitem")).toHaveLength(2);
    expect(within(card).getByText("Other upstream")).toBeInTheDocument();
    expect(card).toHaveTextContent("Access to this upstream is frozen.");
  });

  test("asks nothing and shows nothing on a backend that does not offer freezes", async () => {
    const { container } = render(<PortalAccessFreezes enabled={false} accountId="user-1" />);
    // Give a wrongly started request the chance to land before concluding.
    await Promise.resolve();
    expect(mocks.list).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });

  test("shows nothing when there is no freeze, or when it cannot be read", async () => {
    mocks.list.mockResolvedValueOnce([]);
    const first = render(<PortalAccessFreezes enabled accountId="user-1" />);
    await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("portal-access-freezes")).toBeNull();
    first.unmount();

    mocks.list.mockRejectedValueOnce(new Error("offline"));
    render(<PortalAccessFreezes enabled accountId="user-1" />);
    await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(2));
    expect(screen.queryByTestId("portal-access-freezes")).toBeNull();
  });

  test("reads again for another account, and drops the last one's freezes meanwhile", async () => {
    const { rerender } = render(<PortalAccessFreezes enabled accountId="user-1" />);
    expect(await screen.findByTestId("portal-access-freezes")).toBeInTheDocument();

    mocks.list.mockResolvedValueOnce([]);
    rerender(<PortalAccessFreezes enabled accountId="user-2" />);
    await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByTestId("portal-access-freezes")).toBeNull());
  });
});
