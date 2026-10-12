import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@code-proxy/i18n";
import { ThemeProvider, ToastProvider } from "@code-proxy/ui";
import { ProxiesPage } from "../ProxiesPage";

/*
 * Platform-shared proxies on the proxy pool page. The real api-client endpoints run against a
 * mocked transport, so these tests also pin the request shapes the backend contract expects.
 */
const mocks = vi.hoisted(() => ({
  get: vi.fn<(path: string) => Promise<unknown>>(),
  put: vi.fn<(path: string, body?: unknown) => Promise<unknown>>(),
  patch: vi.fn<(path: string, body?: unknown) => Promise<unknown>>(),
  post: vi.fn<(path: string, body?: unknown) => Promise<unknown>>(),
}));

vi.mock("@code-proxy/api-client/client/client", () => ({
  apiClient: {
    get: (path: string) => mocks.get(path),
    put: (path: string, body?: unknown) => mocks.put(path, body),
    patch: (path: string, body?: unknown) => mocks.patch(path, body),
    post: (path: string, body?: unknown) => mocks.post(path, body),
  },
}));

const TENANTS = {
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
};

function serve(pool: unknown) {
  mocks.get.mockImplementation(async (path: string) => {
    if (path === "/proxy-pool") return pool;
    if (path === "/tenants") return TENANTS;
    throw new Error(`unexpected GET ${path}`);
  });
}

function renderPage() {
  return render(
    <ThemeProvider>
      <ToastProvider>
        <ProxiesPage />
      </ToastProvider>
    </ThemeProvider>,
  );
}

const rowOf = async (name: string) => {
  const cell = await screen.findByText(name);
  const row = cell.closest("tr");
  if (!row) throw new Error(`no row for ${name}`);
  return row;
};

describe("ProxiesPage platform sharing", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    window.sessionStorage.clear();
    window.localStorage.clear();
    mocks.get.mockReset();
    mocks.put.mockReset();
    mocks.patch.mockReset();
    mocks.post.mockReset();
    mocks.put.mockResolvedValue({ status: "ok" });
    mocks.post.mockImplementation(async (path: string) => {
      if (path === "/proxy-pool/check") return { ok: true, latency_ms: 40 };
      return { status: "ok" };
    });
  });

  describe("system tenant", () => {
    const systemPool = {
      items: [
        {
          id: "hk",
          name: "HK",
          url: "socks5://u:p@127.0.0.1:1080",
          masked_url: "socks5://127.0.0.1:1080",
          enabled: true,
          sharing: { all: false, tenant_ids: ["t1", "t2"] },
          overridden_by: [{ id: "t2", name: "Potato" }],
        },
        { id: "us", name: "US", url: "http://127.0.0.1:7890", enabled: true },
      ],
      sharing: { supported: true, manageable: true },
    };

    test("shows who each proxy is shared with and saves a new grant", async () => {
      serve(systemPool);
      renderPage();

      expect(await screen.findByRole("columnheader", { name: /sharing/i })).toBeInTheDocument();
      const hkRow = await rowOf("HK");
      expect(within(hkRow).getByTestId("resource-sharing-badge")).toHaveTextContent(
        "Shared with 2 tenants",
      );
      const usRow = await rowOf("US");
      expect(within(usRow).getByText("Not shared")).toBeInTheDocument();
      await waitFor(() => expect(mocks.get).toHaveBeenCalledWith("/tenants"));

      await userEvent.click(within(usRow).getByRole("button", { name: /sharing for us/i }));
      const dialog = await screen.findByRole("dialog", { name: /share proxy us/i });
      await userEvent.click(within(dialog).getByRole("radio", { name: /share with all tenants/i }));
      mocks.put.mockResolvedValueOnce({ status: "ok", sharing: { all: true, tenant_ids: [] } });
      await userEvent.click(within(dialog).getByRole("button", { name: /^save$/i }));

      await waitFor(() =>
        expect(mocks.put).toHaveBeenCalledWith("/proxy-pool/us/sharing", {
          all: true,
          tenant_ids: [],
        }),
      );
      expect(await screen.findByText("Sharing updated for US")).toBeInTheDocument();
      // The page reloads so the column reflects what the server stored.
      await waitFor(() =>
        expect(mocks.get.mock.calls.filter(([path]) => path === "/proxy-pool")).toHaveLength(2),
      );
    });

    test("switches tenants that override a shared proxy over to it", async () => {
      serve(systemPool);
      renderPage();

      const hkRow = await rowOf("HK");
      const overridden = within(hkRow).getByRole("button", {
        name: /switch 1 tenant to the shared hk/i,
      });
      expect(overridden).toHaveTextContent("1 tenant still uses its own");
      await userEvent.click(overridden);

      const dialog = await screen.findByRole("dialog", {
        name: /switch tenants to the shared hk/i,
      });
      expect(within(dialog).getByText("Potato")).toBeInTheDocument();
      expect(within(dialog).getByText(/proxy with id hk is deleted/i)).toBeInTheDocument();

      mocks.post.mockImplementation(async (path: string) => {
        if (path === "/proxy-pool/hk/adopt")
          return { status: "ok", tenants: [{ id: "t2", name: "Potato" }] };
        return { ok: true, latency_ms: 40 };
      });
      await userEvent.click(within(dialog).getByRole("button", { name: /switch to shared/i }));

      await waitFor(() =>
        expect(mocks.post).toHaveBeenCalledWith("/proxy-pool/hk/adopt", undefined),
      );
      expect(
        await screen.findByText("Switched 1 tenant to the shared HK: Potato"),
      ).toBeInTheDocument();
      await waitFor(() =>
        expect(mocks.get.mock.calls.filter(([path]) => path === "/proxy-pool")).toHaveLength(2),
      );
    });

    test("warns that deleting or editing a shared proxy reaches the granted tenants", async () => {
      serve(systemPool);
      renderPage();

      const hkRow = await rowOf("HK");
      await userEvent.click(within(hkRow).getByRole("button", { name: "Delete HK" }));
      const del = await screen.findByRole("dialog", { name: /delete proxy/i });
      expect(within(del).getByText(/their accounts that use it lose it too/i)).toBeInTheDocument();
      await userEvent.click(within(del).getByRole("button", { name: /cancel/i }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

      await userEvent.click(within(hkRow).getByRole("button", { name: "Edit HK" }));
      const edit = await screen.findByRole("dialog", { name: /edit proxy/i });
      expect(
        within(edit).getByText(/shared with 2 tenants\. once saved, their accounts/i),
      ).toBeInTheDocument();
      await userEvent.click(within(edit).getByRole("button", { name: /cancel/i }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

      // An unshared proxy keeps the plain confirmation.
      const usRow = await rowOf("US");
      await userEvent.click(within(usRow).getByRole("button", { name: "Delete US" }));
      const plain = await screen.findByRole("dialog", { name: /delete proxy/i });
      expect(
        within(plain).queryByText(/their accounts that use it lose it too/i),
      ).not.toBeInTheDocument();
    });

    test("does not offer the switch while the shared proxy is disabled", async () => {
      serve({
        ...systemPool,
        items: [{ ...systemPool.items[0], enabled: false }, systemPool.items[1]],
      });
      renderPage();

      const hkRow = await rowOf("HK");
      await userEvent.click(within(hkRow).getByRole("button", { name: /switch 1 tenant/i }));
      const dialog = await screen.findByRole("dialog");
      expect(within(dialog).getByText(/this proxy is disabled/i)).toBeInTheDocument();
      expect(within(dialog).getByRole("button", { name: /switch to shared/i })).toBeDisabled();
    });

    test("shows sharing read-only to system tenant members who cannot manage it", async () => {
      serve({ ...systemPool, sharing: { supported: true, manageable: false } });
      renderPage();

      const hkRow = await rowOf("HK");
      expect(within(hkRow).getByTestId("resource-sharing-badge")).toBeInTheDocument();
      expect(within(hkRow).getByTestId("proxy-overridden-by").tagName).toBe("SPAN");
      expect(screen.queryByRole("button", { name: /sharing for/i })).not.toBeInTheDocument();
      // No tenant directory request: only platform administrators may read it.
      expect(mocks.get).not.toHaveBeenCalledWith("/tenants");
    });

    test("hides every sharing control on a backend without sharing support", async () => {
      serve({ items: systemPool.items });
      renderPage();

      await rowOf("HK");
      expect(screen.queryByRole("columnheader", { name: /sharing/i })).not.toBeInTheDocument();
      expect(screen.queryByTestId("resource-sharing-badge")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /sharing for/i })).not.toBeInTheDocument();
      expect(screen.queryByText("Platform-shared proxies")).not.toBeInTheDocument();
    });
  });

  describe("granted tenant", () => {
    const tenantPool = {
      items: [{ id: "hk", name: "My HK", url: "socks5://me:pw@10.0.0.1:1080", enabled: true }],
      shared_items: [
        {
          id: "hk",
          name: "Platform HK",
          enabled: true,
          masked_url: "socks5://203.0.113.1:1080",
          overridden: true,
        },
        {
          id: "sg",
          name: "Platform SG",
          enabled: true,
          description: "platform exit",
          masked_url: "http://203.0.113.9:8080",
          overridden: false,
        },
      ],
      sharing: { supported: true, manageable: false },
    };

    test("lists platform proxies read-only below the tenant's own and checks them by id", async () => {
      serve(tenantPool);
      renderPage();

      expect(await screen.findByText("Platform-shared proxies")).toBeInTheDocument();
      const sharedTable = screen.getByRole("table", { name: /platform-shared proxies table/i });
      const sgRow = within(sharedTable).getByText("Platform SG").closest("tr")!;
      expect(within(sgRow).getByText("HTTP")).toBeInTheDocument();
      expect(within(sgRow).getByText("203.0.113.9:8080")).toBeInTheDocument();
      expect(within(sgRow).getByText("platform exit")).toBeInTheDocument();
      // Read-only: the only action is a latency check.
      expect(within(sgRow).queryByRole("button", { name: /edit|delete/i })).not.toBeInTheDocument();
      expect(await within(sgRow).findByText("40 ms")).toBeInTheDocument();

      const hkShared = within(sharedTable).getByText("Platform HK").closest("tr")!;
      expect(within(hkShared).getByTestId("shared-proxy-overridden")).toBeInTheDocument();
      expect(
        within(hkShared).getByRole("button", { name: /check platform hk latency/i }),
      ).toBeDisabled();

      // Own hk once (the overridden shared entry would check the same id), shared sg once.
      await waitFor(() =>
        expect(mocks.post.mock.calls.filter(([path]) => path === "/proxy-pool/check")).toHaveLength(
          2,
        ),
      );
      expect(mocks.post).toHaveBeenCalledWith("/proxy-pool/check", { id: "hk" });
      expect(mocks.post).toHaveBeenCalledWith("/proxy-pool/check", { id: "sg" });
      // A grantee never gets a sharing editor.
      expect(screen.queryByRole("button", { name: /sharing for/i })).not.toBeInTheDocument();
    });

    test("switches an overriding proxy to the platform one, writing back only own entries", async () => {
      serve(tenantPool);
      renderPage();

      const ownTable = await screen.findByRole("table", { name: /^proxy pool table$/i });
      const ownRow = within(ownTable).getByText("My HK").closest("tr")!;
      expect(within(ownRow).getByTestId("proxy-overrides-shared")).toHaveTextContent(
        "Overrides a platform proxy",
      );
      await userEvent.click(
        within(ownRow).getByRole("button", { name: /use platform proxy for my hk/i }),
      );

      const dialog = await screen.findByRole("dialog", {
        name: /switch my hk to the platform proxy/i,
      });
      await userEvent.click(within(dialog).getByRole("button", { name: /^use platform proxy$/i }));

      await waitFor(() => expect(mocks.put).toHaveBeenCalledWith("/proxy-pool", { items: [] }));
      expect(await screen.findByText("My HK now uses the platform proxy")).toBeInTheDocument();
      await waitFor(() =>
        expect(mocks.get.mock.calls.filter(([path]) => path === "/proxy-pool")).toHaveLength(2),
      );
    });

    test("adding a proxy never copies platform proxies into the tenant pool", async () => {
      serve(tenantPool);
      renderPage();

      await screen.findByText("Platform SG");
      await userEvent.click(screen.getByRole("button", { name: /add proxy/i }));
      const dialog = await screen.findByRole("dialog", { name: /add proxy/i });
      await userEvent.type(within(dialog).getByLabelText(/^name/i), "Tokyo");
      await userEvent.click(within(dialog).getByLabelText("Host"));
      await userEvent.paste("http://198.51.100.20:3128");
      await userEvent.click(within(dialog).getByRole("button", { name: /^save$/i }));

      await waitFor(() => expect(mocks.put).toHaveBeenCalled());
      const body = mocks.put.mock.calls.at(-1)?.[1] as {
        items: Array<{ id: string; url: string }>;
      };
      expect(mocks.put.mock.calls.at(-1)?.[0]).toBe("/proxy-pool");
      expect(body.items.map((item) => item.id)).toEqual(["hk", "tokyo"]);
      expect(body.items.every((item) => item.url !== "")).toBe(true);
    });
  });
});
