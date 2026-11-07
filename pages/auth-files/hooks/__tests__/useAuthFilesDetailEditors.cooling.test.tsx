/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { AuthFileItem } from "@code-proxy/api-client";

const mocks = vi.hoisted(() => ({
  downloadText: vi.fn(),
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
    downloadText: mocks.downloadText,
    getModelsForAuthFile: vi.fn(async () => ({ models: [], source: "registry" })),
    getFile: vi.fn(async () => ({})),
    patchFields: vi.fn(),
    upload: vi.fn(),
  },
  identityFingerprintApi: {
    getAccount: vi.fn(),
    getAccountDetail: vi.fn(),
    updateAccountPolicy: vi.fn(),
    deleteAccountProfile: vi.fn(),
  },
  usageApi: { getAuthFileTrend: vi.fn() },
}));

import { useAuthFilesDetailEditors } from "../useAuthFilesDetailEditors";

// The account detail edits the auth file's JSON and uploads it whole; the cooling
// override is the JSON's disable_cooling, which the backend reads from metadata.
describe("useAuthFilesDetailEditors cooling override", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const openFields = async (json: Record<string, unknown>) => {
    mocks.downloadText.mockResolvedValue(JSON.stringify(json));
    const hook = renderHook(() =>
      useAuthFilesDetailEditors(async (): Promise<AuthFileItem[]> => [], undefined, false),
    );
    act(() => {
      hook.result.current.setDetailFile({ name: "relay.json", type: "gemini-cli" } as AuthFileItem);
      hook.result.current.setDetailTab("fields");
      hook.result.current.setDetailOpen(true);
    });
    await waitFor(() => expect(hook.result.current.prefixProxyEditor.json).not.toBeNull());
    return hook;
  };

  it("reads the override, including the legacy key, without marking the form dirty", async () => {
    const { result } = await openFields({ email: "a@example.com", "disable-cooling": true });
    expect(result.current.prefixProxyEditor.disableCooling).toBe("off");
    expect(result.current.prefixProxyDirty).toBe(false);
  });

  it("writes the choice into the JSON that gets uploaded", async () => {
    const { result } = await openFields({ email: "a@example.com", "disable-cooling": true });

    act(() => {
      result.current.setPrefixProxyEditor((prev) => ({ ...prev, disableCooling: "on" }));
    });
    expect(result.current.prefixProxyDirty).toBe(true);
    expect(JSON.parse(result.current.prefixProxyUpdatedText)).toEqual({
      email: "a@example.com",
      disable_cooling: false,
    });

    act(() => {
      result.current.setPrefixProxyEditor((prev) => ({ ...prev, disableCooling: "" }));
    });
    expect(JSON.parse(result.current.prefixProxyUpdatedText)).toEqual({ email: "a@example.com" });
  });
});
