import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ThemeProvider, ToastProvider } from "@code-proxy/ui";
import type { AuthFileItem, AuthFilesResponse, ResourceSharingInput } from "@code-proxy/api-client";
import { AuthFilesPage } from "@pages/auth-files/AuthFilesPage";
import i18n from "@code-proxy/i18n";

/*
 * Platform sharing on the AI accounts page: badges, the share dialog (single and batch) for the
 * platform administrator in the system tenant, the read-only platform view for granted tenants,
 * and the fallback to the old page on backends that do not declare sharing.
 */
const mocks = vi.hoisted(() => ({
  list: vi.fn(async (): Promise<AuthFilesResponse> => ({ files: [] })),
  updateSharing: vi.fn(async (input: ResourceSharingInput & { ids: string[] }) => ({
    ids: input.ids,
    sharing: input.all
      ? { all: true, tenantIds: [] as string[] }
      : input.tenantIds.length > 0
        ? { all: false, tenantIds: input.tenantIds }
        : null,
  })),
  tenants: vi.fn(async () => ({
    items: [
      {
        id: "sys",
        slug: "system",
        name: "System Administration",
        type: "system",
        status: "active",
        effective_status: "active",
      },
      {
        id: "t1",
        slug: "bamboo",
        name: "Bamboo",
        type: "standard",
        status: "active",
        effective_status: "active",
      },
      {
        id: "t2",
        slug: "potato",
        name: "Potato",
        type: "standard",
        status: "active",
        effective_status: "active",
      },
    ],
  })),
}));

vi.mock("@app/providers/AuthProvider", () => ({
  useOptionalAuth: () => ({
    can: () => true,
    state: {
      principal: {
        platform_admin: true,
        effective_tenant: { id: "sys", type: "system", name: "System Administration" },
      },
    },
    actions: {},
  }),
}));

vi.mock("@code-proxy/api-client", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@code-proxy/api-client")>();
  return {
    ...mod,
    authFilesApi: {
      ...mod.authFilesApi,
      list: mocks.list,
      updateSharing: mocks.updateSharing,
    },
    usageApi: {
      ...mod.usageApi,
      getEntityStats: vi.fn(async () => ({ source: [], auth_index: [] })),
    },
    aiAccountsStatusApi: {
      getStatus: vi.fn(async () => ({ items: [] })),
      startStatusRefresh: vi.fn(async () => ({ job_id: "job-1", accepted: 0, deduplicated: 0 })),
      getStatusRefreshJob: vi.fn(async () => ({
        job_id: "job-1",
        state: "completed",
        total: 0,
        completed: 0,
        failed: 0,
        results: [],
      })),
    },
    modelsApi: {
      ...mod.modelsApi,
      getModelConfigs: vi.fn(async (): Promise<unknown[]> => []),
      getModelOwnerPresets: vi.fn(async (): Promise<unknown[]> => []),
      getAuthGroupModelOwnerMappingMap: vi.fn(async () => ({})),
    },
  };
});

vi.mock("@code-proxy/api-client/endpoints/identity", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@code-proxy/api-client/endpoints/identity")>();
  return { ...mod, identityApi: { ...mod.identityApi, tenants: mocks.tenants } };
});

vi.mock("@code-proxy/api-client/endpoints/proxies", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@code-proxy/api-client/endpoints/proxies")>();
  return {
    ...mod,
    proxiesApi: {
      ...mod.proxiesApi,
      listSelectable: vi.fn(async (): Promise<unknown[]> => []),
    },
  };
});

vi.mock("@code-proxy/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@code-proxy/ui")>()),
  EChart: ({ className }: { className?: string }) => <div className={className}>chart</div>,
}));

const codexShared: AuthFileItem = {
  id: "codex-a.json",
  name: "codex-a.json",
  label: "Codex A",
  type: "codex",
  provider: "codex",
  account_type: "oauth",
  auth_index: "codex-a",
  disabled: false,
  sharing: { all: false, tenant_ids: ["t1"] },
  tenant_copies: [{ id: "t2", name: "Potato" }],
};

const claudeUnshared: AuthFileItem = {
  id: "claude-b.json",
  name: "claude-b.json",
  label: "Claude B",
  type: "claude",
  provider: "claude",
  account_type: "oauth",
  auth_index: "claude-b",
  disabled: false,
};

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={["/auth-files"]}>
      <ThemeProvider>
        <ToastProvider>
          <AuthFilesPage />
        </ToastProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );

const cardOf = async (title: string) => {
  const cards = await screen.findByTestId("auth-files-cards");
  const card = (await within(cards).findByText(title)).closest("section");
  if (!card) throw new Error(`no card for ${title}`);
  return within(card as HTMLElement);
};

describe("AuthFilesPage platform sharing", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    window.localStorage.setItem("authFilesPage.quotaAutoRefreshMs.v1", JSON.stringify(0));
    mocks.list.mockReset();
    mocks.updateSharing.mockClear();
    mocks.tenants.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  test("shows sharing and tenant copies, and shares one account from its menu", async () => {
    mocks.list.mockImplementation(async () => ({
      files: [codexShared, claudeUnshared],
      sharing: { supported: true, manageable: true },
    }));
    const user = userEvent.setup();
    renderPage();

    const codex = await cardOf("Codex A");
    expect(codex.getByTestId("resource-sharing-badge")).toHaveTextContent("Shared with 1 tenant");
    expect(codex.getByTestId("auth-file-tenant-copies")).toHaveTextContent("1 tenant has a copy");
    const claude = await cardOf("Claude B");
    expect(claude.queryByTestId("resource-sharing-badge")).not.toBeInTheDocument();
    await waitFor(() => expect(mocks.tenants).toHaveBeenCalled());

    await user.click(claude.getByRole("button", { name: "More actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Share with tenants…" }));
    const dialog = await screen.findByRole("dialog", { name: /share account claude b/i });
    await user.click(within(dialog).getByRole("radio", { name: /share with all tenants/i }));
    await user.click(within(dialog).getByRole("button", { name: /^save$/i }));

    await waitFor(() =>
      expect(mocks.updateSharing).toHaveBeenCalledWith({
        ids: ["claude-b.json"],
        all: true,
        tenantIds: [],
      }),
    );
    expect(await screen.findByText("Sharing updated for Claude B")).toBeInTheDocument();
    await waitFor(async () =>
      expect((await cardOf("Claude B")).getByTestId("resource-sharing-badge")).toHaveTextContent(
        "Shared with all tenants",
      ),
    );
  });

  test("shares a selection in one go and warns when their settings differ", async () => {
    mocks.list.mockImplementation(async () => ({
      files: [codexShared, claudeUnshared],
      sharing: { supported: true, manageable: true },
    }));
    const user = userEvent.setup();
    renderPage();

    await cardOf("Codex A");
    await user.click(screen.getByLabelText("Select Codex A"));
    await user.click(screen.getByLabelText("Select Claude B"));
    await user.click(screen.getByRole("button", { name: "Share (2)" }));

    const dialog = await screen.findByRole("dialog", { name: /share 2 accounts/i });
    expect(
      within(dialog).getByText(/these 2 accounts are shared differently/i),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole("radio", { name: /share with specific tenants/i }));
    await user.click(within(dialog).getByRole("combobox", { name: /tenants/i }));
    await user.click(await screen.findByRole("option", { name: /^potato$/i }));
    await user.click(within(dialog).getByRole("button", { name: /^save$/i }));

    await waitFor(() =>
      expect(mocks.updateSharing).toHaveBeenCalledWith({
        ids: ["codex-a.json", "claude-b.json"],
        all: false,
        tenantIds: ["t2"],
      }),
    );
    expect(await screen.findByText("Sharing updated for 2 accounts")).toBeInTheDocument();
  });

  test("names shared accounts in the delete confirmation", async () => {
    mocks.list.mockImplementation(async () => ({
      files: [codexShared, claudeUnshared],
      sharing: { supported: true, manageable: true },
    }));
    const user = userEvent.setup();
    renderPage();

    await cardOf("Codex A");
    await user.click(screen.getByLabelText("Select Codex A"));
    await user.click(screen.getByLabelText("Select Claude B"));
    await user.click(screen.getByRole("button", { name: "Delete selected (2)" }));

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText("1 of them is shared with other tenants, who lose it too."),
    ).toBeInTheDocument();
  });

  test("adds a sharing column to the list view with a per-row share button", async () => {
    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("table"));
    mocks.list.mockImplementation(async () => ({
      files: [codexShared, claudeUnshared],
      sharing: { supported: true, manageable: true },
    }));
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByRole("columnheader", { name: /sharing/i })).toBeInTheDocument();
    const row = (await screen.findByText("Claude B")).closest("tr") as HTMLElement;
    expect(within(row).getByText("Not shared")).toBeInTheDocument();
    await user.click(within(row).getByRole("button", { name: "Sharing for Claude B" }));
    expect(
      await screen.findByRole("dialog", { name: /share account claude b/i }),
    ).toBeInTheDocument();
  });

  test("system tenant members who cannot manage sharing only see it", async () => {
    mocks.list.mockImplementation(async () => ({
      files: [codexShared, claudeUnshared],
      sharing: { supported: true, manageable: false },
    }));
    const user = userEvent.setup();
    renderPage();

    const codex = await cardOf("Codex A");
    expect(codex.getByTestId("resource-sharing-badge")).toBeInTheDocument();
    await user.click(codex.getByRole("button", { name: "More actions" }));
    expect(await screen.findByRole("menuitem", { name: "Edit Tags" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Share with tenants…" })).not.toBeInTheDocument();
    expect(mocks.tenants).not.toHaveBeenCalled();
  });

  test("granted tenants get a read-only platform view and a duplicate warning", async () => {
    mocks.list.mockImplementation(async () => ({
      files: [
        {
          ...claudeUnshared,
          name: "my-claude.json",
          id: "my-claude.json",
          label: "My Claude",
          duplicates_shared: true,
        },
      ],
      shared_files: [
        {
          id: "platform-claude.json",
          name: "platform-claude.json",
          label: "Platform Claude",
          email: "ops@example.com",
          type: "claude",
          provider: "claude",
          account_type: "oauth",
          plan_type: "max",
          disabled: false,
        },
        {
          id: "platform-codex.json",
          name: "platform-codex.json",
          label: "Platform Codex",
          type: "codex",
          provider: "codex",
          account_type: "oauth",
          disabled: true,
          concurrency_limit: 4,
        },
      ],
      sharing: { supported: true, manageable: false },
    }));
    const user = userEvent.setup();
    renderPage();

    const own = await cardOf("My Claude");
    expect(own.getByTestId("auth-file-duplicates-shared")).toHaveTextContent(
      "Duplicates a platform account",
    );
    expect(screen.getByRole("tab", { name: "This tenant 1" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await user.click(screen.getByRole("tab", { name: "Platform-shared 2" }));
    const table = await screen.findByRole("table", { name: /platform-shared accounts table/i });
    expect(screen.queryByTestId("auth-files-cards")).not.toBeInTheDocument();
    expect(screen.getByText(/view only/i)).toBeInTheDocument();

    const claudeRow = within(table).getByText("Platform Claude").closest("tr") as HTMLElement;
    expect(within(claudeRow).getByText("ops@example.com")).toBeInTheDocument();
    expect(within(claudeRow).getByText("Available")).toBeInTheDocument();
    expect(within(claudeRow).getByTestId("auth-file-plan-badge")).toBeInTheDocument();
    const codexRow = within(table).getByText("Platform Codex").closest("tr") as HTMLElement;
    expect(within(codexRow).getByText("Disabled")).toBeInTheDocument();
    expect(within(codexRow).getByText("4")).toBeInTheDocument();
    // Nothing to act on: no edit, delete, download, refresh or test controls in the rows.
    for (const row of [claudeRow, codexRow]) {
      expect(within(row).queryAllByRole("button")).toHaveLength(0);
      expect(within(row).queryByRole("checkbox")).not.toBeInTheDocument();
    }
  });

  test("warns about copies of an account that other tenants imported", async () => {
    mocks.list.mockImplementation(async () => ({
      files: [
        {
          ...claudeUnshared,
          name: "my-claude.json",
          id: "my-claude.json",
          label: "My Claude",
          copies_elsewhere: 2,
        },
        {
          ...codexShared,
          sharing: undefined,
          tenant_copies: undefined,
          label: "My Codex",
          copies_elsewhere: 1,
          // Only a platform administrator acting in the tenant gets the names.
          copies_elsewhere_tenants: [{ id: "t9", name: "Potato" }],
        },
        {
          ...claudeUnshared,
          name: "solo.json",
          id: "solo.json",
          label: "Solo",
          copies_elsewhere: 0,
        },
      ],
      shared_files: [],
      sharing: { supported: true, manageable: false },
    }));
    renderPage();

    const mine = await cardOf("My Claude");
    expect(mine.getByTestId("auth-file-copies-elsewhere")).toHaveTextContent(
      "In 2 other tenants too",
    );
    const named = await cardOf("My Codex");
    expect(named.getByTestId("auth-file-copies-elsewhere")).toHaveTextContent(
      "In 1 other tenant too",
    );
    expect((await cardOf("Solo")).queryByTestId("auth-file-copies-elsewhere")).toBeNull();
  });

  test("an old backend without sharing keeps the page exactly as before", async () => {
    mocks.list.mockImplementation(async () => ({
      files: [codexShared, claudeUnshared],
      // A backend that predates sharing never sends `sharing`; stray fields are ignored too.
      shared_files: [{ name: "stray.json", label: "Stray" }],
    }));
    const user = userEvent.setup();
    renderPage();

    const codex = await cardOf("Codex A");
    expect(codex.queryByTestId("resource-sharing-badge")).not.toBeInTheDocument();
    expect(codex.queryByTestId("auth-file-tenant-copies")).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /platform-shared/i })).not.toBeInTheDocument();
    await user.click(codex.getByRole("button", { name: "More actions" }));
    expect(await screen.findByRole("menuitem", { name: "Edit Tags" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Share with tenants…" })).not.toBeInTheDocument();
    expect(mocks.tenants).not.toHaveBeenCalled();
  });
});
