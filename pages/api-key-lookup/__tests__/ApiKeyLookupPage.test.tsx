import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ApiKeyLookupPage } from "../ApiKeyLookupPage";
import { ThemeProvider } from "@code-proxy/ui";
import { ToastProvider } from "@code-proxy/ui";

const mocks = vi.hoisted(() => ({
  fetchPublicLogs: vi.fn(async () => ({
    items: [],
    total: 0,
    page: 1,
    size: 50,
    api_key_name: "Primary key",
    stats: { total: 0, success_rate: 0, total_tokens: 0, total_sessions: 0, total_cost: 0 },
    filters: { models: [] },
  })),
  fetchPublicChartData: vi.fn(async () => ({
    daily_series: [],
    heatmap_series: [],
    model_distribution: [],
    api_key_name: "Primary key",
    stats: { total: 0, success_rate: 0, total_tokens: 0, total_sessions: 0, total_cost: 0 },
  })),
  fetchAvailableModels: vi.fn(async (): Promise<string[]> => []),
}));

vi.mock("../api", () => ({
  fetchPublicLogs: mocks.fetchPublicLogs,
  fetchPublicChartData: mocks.fetchPublicChartData,
  fetchAvailableModels: mocks.fetchAvailableModels,
}));

vi.mock("../components/UsageTabSection", () => ({
  UsageTabSection: () => <div data-testid="usage-tab" />,
}));

vi.mock("@features/log-content-viewer", () => ({
  LogContentModal: () => null,
}));

describe("ApiKeyLookupPage", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.history.replaceState({}, "", "/manage/apikey-lookup");
    vi.clearAllMocks();
  });

  test("opens the API key login modal when no key is stored", async () => {
    render(
      <ThemeProvider>
        <ToastProvider>
          <ApiKeyLookupPage />
        </ToastProvider>
      </ThemeProvider>,
    );

    expect(screen.getByRole("dialog", { name: /enter api key/i })).toBeInTheDocument();

    await userEvent.type(
      screen.getByPlaceholderText(/enter api key to lookup usage/i),
      "sk-new-key",
    );
    await userEvent.click(screen.getByRole("button", { name: /login/i }));

    await waitFor(() => {
      expect(mocks.fetchPublicLogs).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: "sk-new-key" }),
      );
    });
  });

  test("restores the last looked up API key after page refresh and shows its name", async () => {
    window.sessionStorage.setItem("apiKeyLookup.lastApiKey.v1", "sk-restored-key");

    render(
      <ThemeProvider>
        <ToastProvider>
          <ApiKeyLookupPage />
        </ToastProvider>
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(mocks.fetchPublicLogs).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: "sk-restored-key" }),
      );
      expect(mocks.fetchPublicChartData).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: "sk-restored-key" }),
      );
    });
    expect(await screen.findByRole("combobox", { name: /primary key/i })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: /enter api key/i })).not.toBeInTheDocument();
  });

  test("does not duplicate the current key in the header menu", async () => {
    window.sessionStorage.setItem("apiKeyLookup.lastApiKey.v1", "sk-restored-key");

    render(
      <ThemeProvider>
        <ToastProvider>
          <ApiKeyLookupPage />
        </ToastProvider>
      </ThemeProvider>,
    );

    await userEvent.click(await screen.findByRole("combobox", { name: /primary key/i }));

    expect(screen.queryByRole("option", { name: /primary key/i })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: /logout/i })).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });

  test("logs out from the header menu and asks for the API key again", async () => {
    window.sessionStorage.setItem("apiKeyLookup.lastApiKey.v1", "sk-restored-key");

    render(
      <ThemeProvider>
        <ToastProvider>
          <ApiKeyLookupPage />
        </ToastProvider>
      </ThemeProvider>,
    );

    await userEvent.click(await screen.findByRole("combobox", { name: /primary key/i }));
    await userEvent.click(screen.getByRole("option", { name: /logout/i }));

    expect(window.sessionStorage.getItem("apiKeyLookup.lastApiKey.v1")).toBeNull();
    expect(screen.getByRole("dialog", { name: /enter api key/i })).toBeInTheDocument();
  });
});
