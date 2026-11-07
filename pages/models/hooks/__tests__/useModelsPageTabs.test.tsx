import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useModelsPageTabs } from "../useModelsPageTabs";

const mocks = vi.hoisted(() => ({ apiGet: vi.fn(), tenant: "" }));

vi.mock("@code-proxy/api-client", () => ({ apiClient: { get: mocks.apiGet } }));
vi.mock("@code-proxy/domain", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@code-proxy/domain")>()),
  getActiveCacheTenantId: () => mocks.tenant,
}));

const supporting = { capabilities: { "virtual-models": true } };

describe("useModelsPageTabs", () => {
  beforeEach(() => {
    mocks.apiGet.mockResolvedValue(supporting);
  });

  test("offers the virtual models tab once the backend says it supports them", async () => {
    mocks.tenant = "tenant-a";
    const { result } = renderHook(() => useModelsPageTabs());
    expect(result.current.virtualModelsSupported).toBe(false);
    await waitFor(() => expect(result.current.virtualModelsSupported).toBe(true));
    expect(mocks.apiGet).toHaveBeenCalledWith("/routing-config");

    // The virtual tab loads no model list: the scope stays on the tab before it.
    act(() => result.current.selectTab("library"));
    act(() => result.current.selectTab("virtual"));
    expect(result.current).toMatchObject({ activeTab: "virtual", modelScope: "library" });
  });

  test("remembers the answer per tenant, so a failed check keeps the tab", async () => {
    mocks.tenant = "tenant-d";
    const first = renderHook(() => useModelsPageTabs());
    await waitFor(() => expect(first.result.current.virtualModelsSupported).toBe(true));
    first.unmount();

    mocks.apiGet.mockRejectedValue(new Error("network down"));
    const { result } = renderHook(() => useModelsPageTabs());
    // Known from the last visit, before the check answers.
    expect(result.current.virtualModelsSupported).toBe(true);
    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledTimes(2));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.virtualModelsSupported).toBe(true);
  });

  test("leaves the tab for a tenant whose backend predates virtual models", async () => {
    mocks.tenant = "tenant-b";
    const { result, rerender } = renderHook(() => useModelsPageTabs());
    await waitFor(() => expect(result.current.virtualModelsSupported).toBe(true));
    act(() => result.current.selectTab("virtual"));

    mocks.tenant = "tenant-c";
    mocks.apiGet.mockResolvedValue({ capabilities: {} });
    rerender();
    await waitFor(() => expect(result.current.virtualModelsSupported).toBe(false));
    expect(result.current.activeTab).toBe("active");
  });
});
