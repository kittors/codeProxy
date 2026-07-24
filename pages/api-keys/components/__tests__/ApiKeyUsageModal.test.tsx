import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import i18n from "@code-proxy/i18n";
import { ThemeProvider } from "@code-proxy/ui";
import { ApiKeyUsageModal } from "../ApiKeyUsageModal";

describe("ApiKeyUsageModal", () => {
  test("uses shared DataTable empty state when there are no usage rows", async () => {
    await i18n.changeLanguage("en");

    render(
      <ThemeProvider>
        <ApiKeyUsageModal
          open
          onClose={vi.fn()}
          usageViewName="Demo Key"
          maskedKey="sk-***demo"
          usageTotalCount={0}
          usageSummary={{
            inputTokens: 120,
            outputTokens: 30,
            totalTokens: 150,
            requestCount: 8,
            successRate: 87.5,
          }}
          usageTimeRange={7}
          setUsageTimeRange={vi.fn()}
          fetchUsageLogs={vi.fn(async () => undefined)}
          usagePageSize={50}
          usageLoading={false}
          usageLastUpdatedText="Updated 00:00:00"
          usageKeyQuery=""
          setUsageKeyQuery={vi.fn()}
          usageKeyOptions={[]}
          usageChannelQuery=""
          setUsageChannelQuery={vi.fn()}
          usageChannelOptions={[]}
          usageModelQuery=""
          setUsageModelQuery={vi.fn()}
          usageModelOptions={[]}
          usageStatusFilter=""
          setUsageStatusFilter={vi.fn()}
          usageStatusOptions={[]}
          usageLogColumns={[
            {
              key: "id",
              label: "ID",
              render: (row) => row.id,
            },
          ]}
          usageRows={[]}
          usageCurrentPage={1}
          usageTotalPages={1}
          setUsagePageSize={vi.fn()}
        />
      </ThemeProvider>,
    );

    expect(await screen.findByText("No usage records")).toBeInTheDocument();
    expect(document.querySelector("[data-empty-state]")).not.toBeNull();
    expect(document.querySelector("table[data-vt-empty='true']")).not.toBeNull();
    expect(screen.getByRole("region", { name: "Token usage" })).toHaveTextContent(
      "Input120Current pageOutput30Current pageTotal tokens150Filtered results",
    );
    expect(screen.getByRole("region", { name: "Requests" })).toHaveTextContent(
      "Requests8Filtered results",
    );
    expect(screen.getByRole("region", { name: "Success rate" })).toHaveTextContent(
      "Success rate87.5%Filtered results",
    );
  });

  test("renders key/channel/model/status filters without channel group", async () => {
    await i18n.changeLanguage("en");

    render(
      <ThemeProvider>
        <ApiKeyUsageModal
          open
          onClose={vi.fn()}
          usageViewName="Demo Key"
          maskedKey="sk-***demo"
          usageTotalCount={0}
          usageSummary={{
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            requestCount: 0,
            successRate: 0,
          }}
          usageTimeRange={7}
          setUsageTimeRange={vi.fn()}
          fetchUsageLogs={vi.fn(async () => undefined)}
          usagePageSize={50}
          usageLoading={false}
          usageLastUpdatedText="Updated 00:00:00"
          usageKeyQuery=""
          setUsageKeyQuery={vi.fn()}
          usageKeyOptions={[{ value: "", label: "All Keys" }]}
          usageChannelQuery=""
          setUsageChannelQuery={vi.fn()}
          usageChannelOptions={[{ value: "", label: "All Channels" }]}
          usageModelQuery=""
          setUsageModelQuery={vi.fn()}
          usageModelOptions={[{ value: "", label: "All Models" }]}
          usageStatusFilter=""
          setUsageStatusFilter={vi.fn()}
          usageStatusOptions={[{ value: "", label: "All Status" }]}
          usageLogColumns={[{ key: "id", label: "ID", render: (row) => row.id }]}
          usageRows={[]}
          usageCurrentPage={1}
          usageTotalPages={1}
          setUsagePageSize={vi.fn()}
        />
      </ThemeProvider>,
    );

    expect(screen.getByLabelText("Filter by key")).toBeInTheDocument();
    expect(screen.getByLabelText("Filter by channel")).toBeInTheDocument();
    expect(screen.getByLabelText("Filter by model")).toBeInTheDocument();
    expect(screen.getByLabelText("Filter by status")).toBeInTheDocument();
    expect(screen.queryByLabelText(/channel group/i)).toBeNull();
  });
});
