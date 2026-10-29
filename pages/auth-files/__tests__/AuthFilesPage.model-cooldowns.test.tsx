import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ThemeProvider, ToastProvider, toast } from "@code-proxy/ui";
import type { AuthFileItem, AuthFilesResponse } from "@code-proxy/api-client";
import { AuthFilesPage } from "@pages/auth-files/AuthFilesPage";
import i18n from "@code-proxy/i18n";

/*
 * Why an account is cooling and the per-model "retry now": the reason and time on the card badge,
 * the cooling-models menu, the retry round trip (clear one model, reload the account, update the
 * card), and the page against a backend that predates all of it.
 */
const mocks = vi.hoisted(() => ({
  list: vi.fn(async (): Promise<AuthFilesResponse> => ({ files: [] })),
  clearModelCooldown: vi.fn(async (): Promise<{ changed: boolean }> => ({ changed: true })),
}));

vi.mock("@app/providers/AuthProvider", () => ({
  useOptionalAuth: () => ({
    can: () => true,
    state: {
      principal: {
        platform_admin: false,
        effective_tenant: { id: "t1", type: "standard", name: "Tenant" },
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
      clearModelCooldown: mocks.clearModelCooldown,
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

const inSeconds = (seconds: number) => new Date(Date.now() + seconds * 1000).toISOString();

const account = (label: string, extra: Record<string, unknown> = {}): AuthFileItem => ({
  id: `${label}.json`,
  name: `${label}.json`,
  label,
  type: "codex",
  provider: "codex",
  auth_index: `idx-${label}`,
  disabled: false,
  size: 512,
  modified: 1782182400000,
  ...extra,
});

const rateLimitedRestriction = (cooldownReason?: string) => ({
  scope: "auth",
  status: "error",
  unavailable: true,
  http_status: 429,
  next_retry_after: inSeconds(95),
  ...(cooldownReason ? { cooldown_reason: cooldownReason } : {}),
});

const bothModels = () => [
  { model: "gpt-5.5", reason: "rate_limited", until: inSeconds(95), http_status: 429 },
  { model: "gpt-5.4", reason: "upstream_error", until: inSeconds(600), http_status: 503 },
];

const renderPage = () =>
  render(
    <MemoryRouter>
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

describe("AuthFilesPage cooldown reasons and per-model retry", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    // The toast store is global: a toast left over from the previous test must not be on screen.
    toast.dismiss();
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    window.localStorage.setItem("authFilesPage.quotaAutoRefreshMs.v1", JSON.stringify(0));
    mocks.list.mockReset();
    mocks.clearModelCooldown.mockReset();
    mocks.clearModelCooldown.mockResolvedValue({ changed: true });
  });

  afterEach(() => {
    cleanup();
    toast.dismiss();
  });

  test("the card says why the account is cooling and for how long, and offers the cooling models", async () => {
    mocks.list.mockImplementation(async () => ({
      files: [
        account("Cooling", {
          restrictions: [rateLimitedRestriction("rate_limited")],
          model_cooldowns: bothModels(),
        }),
        account("Healthy"),
      ],
    }));
    renderPage();

    const cooling = await cardOf("Cooling");
    expect(cooling.getByTestId("auth-file-restriction-badge")).toHaveTextContent(
      /^Rate limited · (1m \d+s|\d+s)$/,
    );
    expect(cooling.getByTestId("auth-file-model-cooldown-trigger")).toHaveTextContent(
      "Cooling models: 2",
    );

    const healthy = await cardOf("Healthy");
    expect(healthy.queryByTestId("auth-file-restriction-badge")).not.toBeInTheDocument();
    expect(healthy.queryByTestId("auth-file-model-cooldown-trigger")).not.toBeInTheDocument();
  });

  test("retrying one model clears it, reloads the account and the card follows", async () => {
    let cleared = false;
    mocks.clearModelCooldown.mockImplementation(async () => {
      cleared = true;
      return { changed: true };
    });
    mocks.list.mockImplementation(async () => ({
      files: [
        account("Cooling", {
          model_cooldowns: cleared ? bothModels().slice(1) : bothModels(),
        }),
      ],
    }));
    const user = userEvent.setup();
    renderPage();

    const card = await cardOf("Cooling");
    await user.click(card.getByTestId("auth-file-model-cooldown-trigger"));
    const menu = await screen.findByRole("menu");
    await user.click(within(menu).getByRole("menuitem", { name: /Retry gpt-5\.5 now/ }));

    await waitFor(() => expect(mocks.clearModelCooldown).toHaveBeenCalledTimes(1));
    expect(mocks.clearModelCooldown).toHaveBeenCalledWith({
      authIndex: "idx-Cooling",
      model: "gpt-5.5",
    });
    expect(
      await screen.findByText('"gpt-5.5" on "Cooling" can be tried again now'),
    ).toBeInTheDocument();
    await waitFor(async () => {
      const refreshed = await cardOf("Cooling");
      expect(refreshed.getByTestId("auth-file-model-cooldown-trigger")).toHaveTextContent(
        "Cooling models: 1",
      );
    });
  });

  test("clearing the last cooling model removes the menu from the card", async () => {
    let cleared = false;
    mocks.clearModelCooldown.mockImplementation(async () => {
      cleared = true;
      return { changed: true };
    });
    mocks.list.mockImplementation(async () => ({
      files: [
        account("Cooling", {
          model_cooldowns: cleared
            ? undefined
            : [{ model: "gpt-5.5", reason: "rate_limited", until: inSeconds(95) }],
        }),
      ],
    }));
    const user = userEvent.setup();
    renderPage();

    const card = await cardOf("Cooling");
    await user.click(card.getByTestId("auth-file-model-cooldown-trigger"));
    await user.click(await screen.findByRole("menuitem", { name: /Retry gpt-5\.5 now/ }));

    await waitFor(async () => {
      const refreshed = await cardOf("Cooling");
      expect(refreshed.queryByTestId("auth-file-model-cooldown-trigger")).not.toBeInTheDocument();
    });
  });

  test("a failed retry says so and leaves the card as it was", async () => {
    mocks.clearModelCooldown.mockRejectedValue(new Error("auth not found"));
    mocks.list.mockImplementation(async () => ({
      files: [account("Cooling", { model_cooldowns: bothModels() })],
    }));
    const user = userEvent.setup();
    renderPage();

    const card = await cardOf("Cooling");
    await user.click(card.getByTestId("auth-file-model-cooldown-trigger"));
    await user.click(await screen.findByRole("menuitem", { name: /Retry gpt-5\.5 now/ }));

    expect(
      await screen.findByText('Failed to retry "gpt-5.5" on "Cooling": auth not found'),
    ).toBeInTheDocument();
    const same = await cardOf("Cooling");
    expect(same.getByTestId("auth-file-model-cooldown-trigger")).toHaveTextContent(
      "Cooling models: 2",
    );
  });

  test("a backend that predates the cooldown fields keeps the old badge and offers no retry", async () => {
    mocks.list.mockImplementation(async () => ({
      files: [account("Old", { restrictions: [rateLimitedRestriction()] })],
    }));
    renderPage();

    const card = await cardOf("Old");
    expect(card.getByTestId("auth-file-restriction-badge")).toHaveTextContent("429 Error");
    expect(card.queryByTestId("auth-file-model-cooldown-trigger")).not.toBeInTheDocument();
    expect(mocks.clearModelCooldown).not.toHaveBeenCalled();
  });

  test("the table view carries the same badge and menu", async () => {
    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("table"));
    mocks.list.mockImplementation(async () => ({
      files: [
        account("Cooling", {
          restrictions: [rateLimitedRestriction("quota_exhausted")],
          model_cooldowns: bothModels(),
        }),
      ],
    }));
    renderPage();

    const row = (await screen.findByText("Cooling")).closest("tr");
    if (!row) throw new Error("no table row for Cooling");
    expect(within(row).getByTestId("auth-file-restriction-badge")).toHaveTextContent(
      /^Quota used up · /,
    );
    expect(within(row).getByTestId("auth-file-model-cooldown-trigger")).toHaveTextContent(
      "Cooling models: 2",
    );
  });
});
