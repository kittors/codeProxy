import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ApiError } from "@code-proxy/api-client";
import { useAuthFilesStatusState } from "../useAuthFilesStatusState";

const mocks = vi.hoisted(() => ({
  getModelsForAuthFile: vi.fn(),
  getStatus: vi.fn(),
  notify: vi.fn(),
}));

vi.mock("@code-proxy/api-client", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@code-proxy/api-client")>();
  return {
    ...mod,
    authFilesApi: {
      ...mod.authFilesApi,
      getModelsForAuthFile: mocks.getModelsForAuthFile,
    },
    aiAccountsStatusApi: {
      ...mod.aiAccountsStatusApi,
      getStatus: mocks.getStatus,
    },
  };
});

vi.mock("@code-proxy/ui", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@code-proxy/ui")>();
  return {
    ...mod,
    useToast: () => ({ notify: mocks.notify }),
  };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const renderStatusHook = () =>
  renderHook(() =>
    useAuthFilesStatusState({
      tab: "files",
      pageItems: [],
      loading: false,
      setFiles: vi.fn(),
      setDetailFile: vi.fn(),
    }),
  );

describe("checkAuthFileConnectivity", () => {
  beforeEach(() => {
    mocks.getModelsForAuthFile.mockReset();
    mocks.getStatus.mockReset();
    mocks.notify.mockReset();
    mocks.getStatus.mockResolvedValue({ items: [] });
  });

  test("reports latency when the probe succeeds", async () => {
    mocks.getModelsForAuthFile.mockResolvedValue({ models: [], source: "live" });
    const { result } = renderStatusHook();

    await act(async () => {
      await result.current.checkAuthFileConnectivity("codex.json");
    });

    await waitFor(() => {
      const entry = result.current.connectivityState.get("codex.json");
      expect(entry?.error).toBe(false);
      expect(entry?.latencyMs).not.toBeNull();
    });
  });

  // A fast failure used to be painted as a healthy latency, so an unusable
  // credential looked green. The endpoint falls back to the registry on probe
  // failure and still answers 200, so any thrown error is a real failure.
  test("reports an error when the probe fails quickly", async () => {
    mocks.getModelsForAuthFile.mockRejectedValue(
      new ApiError({ message: "upstream unavailable", status: 502 }),
    );
    const { result } = renderStatusHook();

    await act(async () => {
      await result.current.checkAuthFileConnectivity("codex.json");
    });

    await waitFor(() => {
      const entry = result.current.connectivityState.get("codex.json");
      expect(entry?.error).toBe(true);
      expect(entry?.latencyMs).toBeNull();
    });
  });
});
