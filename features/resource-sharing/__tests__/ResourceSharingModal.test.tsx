import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@code-proxy/i18n";
import { ThemeProvider } from "@code-proxy/ui";
import {
  ResourceSharingModal,
  SharingStatusBadge,
  commonResourceSharing,
  type ResourceSharingModalProps,
  type SharingTenant,
} from "@features/resource-sharing";

const tenants: SharingTenant[] = [
  { id: "sys", name: "System Administration", status: "active", system: true },
  { id: "t1", name: "Potato Server", status: "active", system: false },
  { id: "t2", name: "Boundless Tech", status: "disabled", system: false },
  { id: "t3", name: "Meiwei", status: "expired", system: false },
];

function renderModal(props: Partial<ResourceSharingModalProps> = {}) {
  const onSave = vi.fn();
  const onClose = vi.fn();
  render(
    <ThemeProvider>
      <ResourceSharingModal
        open
        kind="proxy"
        resourceName="HK Proxy"
        value={null}
        tenants={tenants}
        onSave={onSave}
        onClose={onClose}
        {...props}
      />
    </ThemeProvider>,
  );
  return { onSave, onClose };
}

describe("ResourceSharingModal", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  test("starts from the current grant and saves the picked tenants", async () => {
    const { onSave } = renderModal({ value: { all: false, tenantIds: ["t1"] } });

    const dialog = await screen.findByRole("dialog", { name: /share proxy hk proxy/i });
    expect(
      within(dialog).getByRole("radio", { name: /share with specific tenants/i }),
    ).toHaveAttribute("aria-checked", "true");

    const picker = within(dialog).getByRole("combobox", { name: /tenants/i });
    expect(picker).toHaveTextContent("Potato Server");
    await userEvent.click(picker);

    const listbox = await screen.findByRole("listbox");
    // The system tenant owns shared resources and can never be granted them.
    expect(
      within(listbox).queryByRole("option", { name: /system administration/i }),
    ).not.toBeInTheDocument();
    // Inactive tenants stay pickable but say why they are greyed out.
    expect(
      within(listbox).getByRole("option", { name: /boundless tech,\s*disabled/i }),
    ).toBeInTheDocument();
    await userEvent.click(within(listbox).getByRole("option", { name: /meiwei,\s*expired/i }));

    await userEvent.click(within(dialog).getByRole("button", { name: /^save$/i }));
    expect(onSave).toHaveBeenCalledWith({ all: false, tenantIds: ["t1", "t3"] });
  });

  test("shares with every tenant and warns that later changes reach them", async () => {
    const { onSave } = renderModal();

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("radio", { name: /don't share/i })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    // Nothing is shared yet: no visibility notes, no warning.
    expect(within(dialog).queryByText(/what granted tenants get/i)).not.toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("radio", { name: /share with all tenants/i }));
    expect(within(dialog).getByText(/what granted tenants get/i)).toBeInTheDocument();
    expect(
      within(dialog).getByText(/never the credentials or the full address/i),
    ).toBeInTheDocument();
    expect(within(dialog).getByText(/immediately affects every account/i)).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("button", { name: /^save$/i }));
    expect(onSave).toHaveBeenCalledWith({ all: true, tenantIds: [] });
  });

  test("requires at least one tenant for a specific grant", async () => {
    const { onSave } = renderModal();
    const dialog = await screen.findByRole("dialog");

    await userEvent.click(
      within(dialog).getByRole("radio", { name: /share with specific tenants/i }),
    );
    await userEvent.click(within(dialog).getByRole("button", { name: /^save$/i }));

    expect(await within(dialog).findByText("Pick at least one tenant")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  test("spells out what unsharing does before saving it", async () => {
    const { onSave } = renderModal({ value: { all: true, tenantIds: [] } });
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("radio", { name: /share with all tenants/i })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    await userEvent.click(within(dialog).getByRole("radio", { name: /don't share/i }));
    expect(within(dialog).getByText(/lose it at once and connect directly/i)).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("button", { name: /^save$/i }));
    expect(onSave).toHaveBeenCalledWith({ all: false, tenantIds: [] });
  });

  test("titles a batch of accounts and flags differing settings", async () => {
    renderModal({ kind: "auth", resourceName: "a@example.com", count: 3, mixed: true });

    const dialog = await screen.findByRole("dialog", { name: /share 3 accounts/i });
    expect(
      within(dialog).getByText(/these 3 accounts are shared differently/i),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("radio", { name: /don't share/i })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    // Unsharing a batch where some are shared still warns.
    expect(within(dialog).getByText(/no longer routed to this account/i)).toBeInTheDocument();
  });

  test("keeps a grant to a tenant the directory no longer knows, so it can be revoked", async () => {
    const { onSave } = renderModal({ value: { all: false, tenantIds: ["ghost", "t1"] } });
    const dialog = await screen.findByRole("dialog");

    await userEvent.click(within(dialog).getByRole("combobox", { name: /tenants/i }));
    const listbox = await screen.findByRole("listbox");
    const ghost = within(listbox).getByRole("option", { name: /ghost,\s*unknown tenant/i });
    expect(ghost).toHaveAttribute("aria-selected", "true");
    await userEvent.click(ghost);

    await userEvent.click(within(dialog).getByRole("button", { name: /^save$/i }));
    expect(onSave).toHaveBeenCalledWith({ all: false, tenantIds: ["t1"] });
  });

  test("re-initialises from the current grant every time it opens", async () => {
    const onSave = vi.fn();
    const props = {
      kind: "proxy" as const,
      resourceName: "HK Proxy",
      tenants,
      onSave,
      onClose: vi.fn(),
    };
    const { rerender } = render(
      <ThemeProvider>
        <ResourceSharingModal {...props} open value={{ all: true, tenantIds: [] }} />
      </ThemeProvider>,
    );
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("radio", { name: /don't share/i }));

    // A parent re-render while open must not wipe the choice being edited.
    rerender(
      <ThemeProvider>
        <ResourceSharingModal {...props} open value={{ all: true, tenantIds: [] }} />
      </ThemeProvider>,
    );
    expect(within(dialog).getByRole("radio", { name: /don't share/i })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    rerender(
      <ThemeProvider>
        <ResourceSharingModal {...props} open={false} value={{ all: true, tenantIds: [] }} />
      </ThemeProvider>,
    );
    rerender(
      <ThemeProvider>
        <ResourceSharingModal {...props} open value={{ all: true, tenantIds: [] }} />
      </ThemeProvider>,
    );
    await waitFor(() =>
      expect(screen.getByRole("radio", { name: /share with all tenants/i })).toHaveAttribute(
        "aria-checked",
        "true",
      ),
    );
  });
});

describe("SharingStatusBadge", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  test("renders nothing for an unshared resource", () => {
    const { container } = render(<SharingStatusBadge sharing={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  test("says all tenants, or how many, and lists the tenant names on focus", async () => {
    const { rerender } = render(<SharingStatusBadge sharing={{ all: true, tenantIds: [] }} />);
    expect(screen.getByTestId("resource-sharing-badge")).toHaveTextContent(
      "Shared with all tenants",
    );

    rerender(
      <SharingStatusBadge
        sharing={{ all: false, tenantIds: ["t1", "missing"] }}
        tenantNames={new Map([["t1", "Potato Server"]])}
      />,
    );
    const badge = screen.getByTestId("resource-sharing-badge");
    expect(badge).toHaveTextContent("Shared with 2 tenants");

    // Keyboard users reach the tenant list too; unknown ids are shown rather than dropped.
    await userEvent.tab();
    expect(badge).toHaveFocus();
    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveTextContent("Potato Server");
    expect(tooltip).toHaveTextContent("missing");
  });
});

describe("commonResourceSharing", () => {
  test("uses the shared value when all match and flags differences otherwise", () => {
    expect(
      commonResourceSharing([
        { all: false, tenantIds: ["a", "b"] },
        { all: false, tenantIds: ["b", "a"] },
      ]),
    ).toEqual({ value: { all: false, tenantIds: ["a", "b"] }, mixed: false });
    expect(commonResourceSharing([null, null])).toEqual({ value: null, mixed: false });
    expect(commonResourceSharing([null, { all: true, tenantIds: [] }])).toEqual({
      value: null,
      mixed: true,
    });
  });
});
