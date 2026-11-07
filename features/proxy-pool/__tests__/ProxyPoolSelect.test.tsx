import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@code-proxy/i18n";
import type { ProxyPoolEntry } from "@code-proxy/api-client/endpoints/proxies";
import { ProxyPoolSelect } from "@features/proxy-pool";

const ownEntry: ProxyPoolEntry = {
  id: "hk",
  name: "My HK",
  url: "socks5://user:pass@127.0.0.1:1080",
  maskedUrl: "socks5://127.0.0.1:1080",
  enabled: true,
};

// What listSelectable() gives for a platform proxy: no url, only the masked address.
const sharedEntry: ProxyPoolEntry = {
  id: "sg",
  name: "Platform SG",
  url: "",
  maskedUrl: "http://203.0.113.9:8080",
  enabled: true,
  shared: true,
};

describe("ProxyPoolSelect", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  test("tags platform-shared proxies and reads their protocol and host from the masked address", async () => {
    const onChange = vi.fn();
    render(
      <ProxyPoolSelect
        value=""
        onChange={onChange}
        entries={[ownEntry, sharedEntry]}
        ariaLabel="Proxy"
        showDetails
      />,
    );

    await userEvent.click(screen.getByRole("combobox", { name: "Proxy" }));
    const shared = await screen.findByRole("option", { name: /platform sg/i });
    expect(within(shared).getByText("Shared")).toBeInTheDocument();
    // An empty url used to show up as the generic "PROXY" protocol.
    expect(within(shared).getByText("HTTP")).toBeInTheDocument();
    expect(within(shared).getByText("203.0.113.9:8080")).toBeInTheDocument();

    const own = screen.getByRole("option", { name: /my hk/i });
    expect(within(own).queryByText("Shared")).not.toBeInTheDocument();
    expect(within(own).getByText("SOCKS5")).toBeInTheDocument();
    expect(within(own).getByText("127.0.0.1:1080")).toBeInTheDocument();

    await userEvent.click(shared);
    expect(onChange).toHaveBeenCalledWith("sg");
  });

  test("keeps the shared tag on the trigger once a shared proxy is picked", () => {
    render(
      <ProxyPoolSelect
        value="sg"
        onChange={() => {}}
        entries={[ownEntry, sharedEntry]}
        ariaLabel="Proxy"
        showDetails
      />,
    );

    const trigger = screen.getByRole("combobox", { name: "Proxy" });
    expect(within(trigger).getByText("Platform SG")).toBeInTheDocument();
    expect(within(trigger).getByText("Shared")).toBeInTheDocument();
    expect(trigger).toHaveTextContent("HTTP · 203.0.113.9:8080");
  });
});
