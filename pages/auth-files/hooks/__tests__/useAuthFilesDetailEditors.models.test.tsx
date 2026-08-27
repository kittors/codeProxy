/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { AuthFileItem } from "@code-proxy/api-client";

type ModelsResponse = {
  models: { id: string; display_name?: string; type?: string; owned_by?: string }[];
  source: "registry" | "upstream" | string;
};

const mocks = vi.hoisted(() => ({
  getModelsForAuthFile: vi.fn(),
  notify: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@code-proxy/ui", () => ({
  useToast: () => ({ notify: mocks.notify }),
}));

vi.mock("@code-proxy/api-client", () => ({
  authFilesApi: {
    getModelsForAuthFile: mocks.getModelsForAuthFile,
    getFile: vi.fn(),
    patchFields: vi.fn(),
  },
  identityFingerprintApi: {
    getAccount: vi.fn(),
  },
  usageApi: {
    getAuthFileTrend: vi.fn(),
  },
}));

import { useAuthFilesDetailEditors } from "../useAuthFilesDetailEditors";

const kimiFile = (name: string): AuthFileItem =>
  ({ name, type: "kimi", provider: "kimi" }) as AuthFileItem;

const renderEditors = () =>
  renderHook(() =>
    useAuthFilesDetailEditors(async (): Promise<AuthFileItem[]> => [], undefined, false),
  );

describe("useAuthFilesDetailEditors kimi model discovery", () => {
  beforeEach(() => {
    mocks.getModelsForAuthFile.mockReset();
    mocks.notify.mockReset();
  });

  // Kimi used to fall outside the shared-discovery set, so every account paid for
  // its own upstream round trip and reopening a panel fell back to the per-file
  // cache instead of the live list.
  it("reuses the provider discovery cache across kimi accounts", async () => {
    mocks.getModelsForAuthFile.mockImplementation(
      async (): Promise<ModelsResponse> => ({
        models: [{ id: "kimi-k2.7", display_name: "Kimi K2.7", owned_by: "moonshot" }],
        source: "upstream",
      }),
    );

    const { result } = renderEditors();

    await act(async () => {
      await result.current.loadModelsForDetail(kimiFile("kimi-a.json"));
    });
    expect(mocks.getModelsForAuthFile).toHaveBeenCalledTimes(1);
    expect(result.current.modelsList.map((model) => model.id)).toEqual(["kimi-k2.7"]);

    await act(async () => {
      await result.current.loadModelsForDetail(kimiFile("kimi-b.json"));
    });
    expect(mocks.getModelsForAuthFile).toHaveBeenCalledTimes(1);
    expect(result.current.modelsList.map((model) => model.id)).toEqual(["kimi-k2.7"]);
  });

  it("refetches upstream for kimi when the operator forces a refresh", async () => {
    mocks.getModelsForAuthFile
      .mockImplementationOnce(
        async (): Promise<ModelsResponse> => ({
          models: [{ id: "kimi-k2.6" }],
          source: "upstream",
        }),
      )
      .mockImplementationOnce(
        async (): Promise<ModelsResponse> => ({
          models: [{ id: "kimi-k2.6" }, { id: "kimi-k2.7" }],
          source: "upstream",
        }),
      );

    const { result } = renderEditors();

    await act(async () => {
      await result.current.loadModelsForDetail(kimiFile("kimi-a.json"));
    });
    await act(async () => {
      await result.current.loadModelsForDetail(kimiFile("kimi-a.json"), { force: true });
    });

    expect(mocks.getModelsForAuthFile).toHaveBeenCalledTimes(2);
    expect(mocks.getModelsForAuthFile).toHaveBeenLastCalledWith("kimi-a.json", {
      force: true,
    });
    expect(result.current.modelsList.map((model) => model.id)).toEqual([
      "kimi-k2.6",
      "kimi-k2.7",
    ]);
  });
});
