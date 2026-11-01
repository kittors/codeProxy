import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useConfigCapabilities } from "@features/backend-capabilities";

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn<() => Promise<Record<string, unknown>>>(),
}));

vi.mock("@code-proxy/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@code-proxy/api-client")>();
  return { ...actual, configApi: { getConfig: mocks.getConfig } };
});

describe("useConfigCapabilities", () => {
  beforeEach(() => {
    mocks.getConfig.mockReset();
  });

  test("reports what GET /config declares, and nothing it does not", async () => {
    mocks.getConfig.mockResolvedValue({ capabilities: { alerts: true } });
    const { result } = renderHook(() => useConfigCapabilities());
    expect(result.current.status).toBe("loading");

    await waitFor(() => expect(result.current.status).toBe("ready"));
    if (result.current.status !== "ready") throw new Error("expected ready");
    expect(result.current.capabilities.alerts).toBe(true);
    expect(result.current.capabilities.poolCapacity).toBe(false);
  });

  test("an older backend that declares nothing is ready with every capability off", async () => {
    mocks.getConfig.mockResolvedValue({ debug: false });
    const { result } = renderHook(() => useConfigCapabilities());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    if (result.current.status !== "ready") throw new Error("expected ready");
    expect(result.current.capabilities).toEqual({
      payloadRulesDryRun: false,
      alerts: false,
      poolCapacity: false,
    });
  });

  test("a failed read is an error that can be retried, not a missing capability", async () => {
    mocks.getConfig.mockRejectedValueOnce(new Error("network down"));
    const { result } = renderHook(() => useConfigCapabilities());
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current).toMatchObject({ status: "error", message: "network down" });

    mocks.getConfig.mockResolvedValueOnce({ capabilities: { "pool-capacity": true } });
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    if (result.current.status !== "ready") throw new Error("expected ready");
    expect(result.current.capabilities.poolCapacity).toBe(true);
    expect(mocks.getConfig).toHaveBeenCalledTimes(2);
  });
});
