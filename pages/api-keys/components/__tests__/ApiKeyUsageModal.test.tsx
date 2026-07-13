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
          usageTimeRange={7}
          setUsageTimeRange={vi.fn()}
          fetchUsageLogs={vi.fn(async () => undefined)}
          usagePageSize={50}
          usageLoading={false}
          usageLastUpdatedText="Updated 00:00:00"
          usageChannelGroupQuery=""
          setUsageChannelGroupQuery={vi.fn()}
          setUsageChannelQuery={vi.fn()}
          usageChannelGroupOptions={[]}
          usageChannelQuery=""
          setUsageChannelQueryDirect={vi.fn()}
          usageChannelOptions={[]}
          usageModelQuery=""
          setUsageModelQuery={vi.fn()}
          usageModelOptions={[]}
          usageStatusFilter=""
          setUsageStatusFilter={vi.fn()}
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
  });
});
