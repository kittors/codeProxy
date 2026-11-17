import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@code-proxy/i18n";
import { findLogGrid, logItem, logsAnswer, renderRequestLogsPage } from "./requestLogsTestKit";

const mocks = vi.hoisted(() => ({
  getUsageLogs: vi.fn(),
  getRequestLogBodyStorage: vi.fn(async () => false),
  getConfig: vi.fn(async () => ({})),
}));

vi.mock("@code-proxy/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@code-proxy/api-client")>();
  return {
    ...actual,
    configApi: {
      ...actual.configApi,
      getRequestLogBodyStorage: mocks.getRequestLogBodyStorage,
      getConfig: mocks.getConfig,
    },
    usageApi: { ...actual.usageApi, getUsageLogs: mocks.getUsageLogs },
  };
});

const maskedRow = () =>
  logsAnswer(
    [
      logItem({
        id: 1000841997,
        timestamp: "2026-09-03T08:56:21Z",
        channel_name: "xieray5@gmail.com",
        provider: "google",
        auth_type: "oauth",
        input_tokens: 169017,
        output_tokens: 68,
        cached_tokens: 163023,
        total_tokens: 170040,
        cost: 0.1392,
        model: "gemini-3.8-flash-high",
        api_key: "sk-test1234567890",
        api_key_name: "袁蔚",
      }),
    ],
    {
      stats: {
        total: 1,
        success_rate: 100,
        total_tokens: 170040,
        total_cost: 0.1392,
        cache_rate: 0.87,
      },
      filters: {
        api_keys: ["user-1"],
        api_key_names: { "user-1": "袁蔚" },
        api_key_counts: { "user-1": 1 },
        models: ["gemini-3.8-flash-high"],
        channels: ["xieray5@gmail.com"],
        channel_options: [
          {
            value: "xieray5@gmail.com",
            label: "xieray5@gmail.com",
            provider: "google",
            auth_type: "oauth",
          },
        ],
        statuses: ["success"],
      },
    },
  );

describe("RequestLogsPage masking toggle", () => {
  beforeEach(async () => {
    window.localStorage.clear();
    await i18n.changeLanguage("zh-CN");
    mocks.getUsageLogs.mockReset();
    mocks.getUsageLogs.mockResolvedValue(maskedRow());
  });

  test("masks channel and user name when toggle button is clicked", async () => {
    const user = userEvent.setup();
    renderRequestLogsPage();

    const grid = await findLogGrid();
    await waitFor(() => {
      expect(within(grid).getByText("xieray5@gmail.com")).toBeInTheDocument();
      expect(within(grid).getByText("袁蔚")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "开启数据脱敏" }));
    await waitFor(() => {
      expect(within(grid).getByText("xi***y5@gmail.com")).toBeInTheDocument();
      expect(within(grid).getByText("袁*")).toBeInTheDocument();
    });
    // Nothing on the page still spells out the unmasked identity (cells, tooltips, detail labels).
    expect(within(grid).queryByText("xieray5@gmail.com")).toBeNull();
    expect(within(grid).queryByText("袁蔚")).toBeNull();

    await user.click(screen.getByRole("button", { name: "关闭数据脱敏" }));
    await waitFor(() => {
      expect(within(grid).getByText("xieray5@gmail.com")).toBeInTheDocument();
      expect(within(grid).getByText("袁蔚")).toBeInTheDocument();
    });
  });
});
