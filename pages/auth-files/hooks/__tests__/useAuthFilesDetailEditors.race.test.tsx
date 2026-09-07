/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { AuthFileItem, IdentityFingerprintAccountDetail } from "@code-proxy/api-client";

const mocks = vi.hoisted(() => ({
  getAuthFileTrend: vi.fn(),
  updateAccountPolicy: vi.fn(),
  deleteAccountProfile: vi.fn(),
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
    getFile: vi.fn(),
    patchFields: vi.fn(),
  },
  identityFingerprintApi: {
    getAccount: vi.fn(),
    getAccountDetail: vi.fn(),
    updateAccountPolicy: mocks.updateAccountPolicy,
    deleteAccountProfile: mocks.deleteAccountProfile,
  },
  usageApi: {
    getAuthFileTrend: mocks.getAuthFileTrend,
  },
}));

import { useAuthFilesDetailEditors } from "../useAuthFilesDetailEditors";

const makeCodexFile = (name: string, authIndex: string): AuthFileItem =>
  ({
    name,
    type: "codex",
    provider: "codex",
    auth_index: authIndex,
    identity_fingerprint_summary: {
      provider: "codex",
      account_key: `acc-${name}`,
    },
  }) as AuthFileItem;

describe("useAuthFilesDetailEditors race condition and confirmation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.downloadText.mockResolvedValue("{}");
  });

  it("selectIdentityFingerprintProfile does not prompt window.confirm", async () => {
    const confirmSpy = vi.spyOn(window, "confirm");
    const { result } = renderHook(() =>
      useAuthFilesDetailEditors(async (): Promise<AuthFileItem[]> => [], undefined, true),
    );

    const detail: IdentityFingerprintAccountDetail = {
      status_scope: "shared",
      subject_scope: "shared",
      share_eligible: true,
      current_tenant_binding_count: 2,
      summary: {
        provider: "codex",
        account_key: "acc-1",
        version: "1.0",
        effective_fields: 1,
        learned_fields: 1,
        source_counts: {},
        enabled: true,
        primary_source: "learned",
        learned: true,
      },
      effective: { version: "1.0", provider: "codex", account_key: "acc-1", enabled: true, fields: {} },
      profiles: [],
      policy: { provider: "codex", account_key: "acc-1", strategy: "active_profile", revision: 1 },
      selection_reason: "active_profile",
      preset: {},
    };

    act(() => {
      // Simulate detail being loaded into state
      (result.current as any).identityFingerprintDetail = detail;
    });

    mocks.updateAccountPolicy.mockResolvedValueOnce(detail);

    await act(async () => {
      // Setting active profile
      await result.current.selectIdentityFingerprintProfile("profile-1");
    });

    expect(confirmSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("discards trend response when current active detail file has switched", async () => {
    const { result } = renderHook(() =>
      useAuthFilesDetailEditors(async (): Promise<AuthFileItem[]> => [], undefined, false),
    );

    let resolveFileA: (val: any) => void = () => {};
    let resolveFileB: (val: any) => void = () => {};

    mocks.getAuthFileTrend.mockImplementation((authIndex: string) => {
      if (authIndex === "auth-a") {
        return new Promise((resolve) => {
          resolveFileA = resolve;
        });
      }
      if (authIndex === "auth-b") {
        return new Promise((resolve) => {
          resolveFileB = resolve;
        });
      }
      return Promise.resolve({ auth_index: authIndex, request_total: 0 });
    });

    const fileA = makeCodexFile("file-a.json", "auth-a");
    const fileB = makeCodexFile("file-b.json", "auth-b");

    // 1. User opens file A
    await act(async () => {
      void result.current.openDetail(fileA);
    });
    expect(result.current.detailFile?.name).toBe("file-a.json");

    // 2. User quickly switches to file B before file A's trend finishes
    await act(async () => {
      void result.current.openDetail(fileB);
    });
    expect(result.current.detailFile?.name).toBe("file-b.json");

    // 3. File A's trend resolves later
    await act(async () => {
      resolveFileA({
        auth_index: "auth-a",
        request_total: 999,
        cycle_request_total: 888,
        cycle_cost_total: 777,
      });
    });

    // Detail trend should NOT be polluted with file A's data
    expect(result.current.detailTrend).toBeNull();

    // 4. File B's trend resolves
    await act(async () => {
      resolveFileB({
        auth_index: "auth-b",
        request_total: 10,
        cycle_request_total: 5,
        cycle_cost_total: 2.5,
      });
    });

    expect(result.current.detailTrend?.auth_index).toBe("auth-b");
    expect(result.current.detailTrend?.request_total).toBe(10);
  });
});
