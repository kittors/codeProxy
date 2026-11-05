import { act, cleanup, renderHook, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ToastProvider, toast } from "@code-proxy/ui";
import type { AuthFileItem } from "@code-proxy/api-client";
import i18n from "@code-proxy/i18n";
import { modelCooldownKey, useAuthFileModelCooldownActions } from "../useAuthFileModelCooldownActions";

const mocks = vi.hoisted(() => ({ clearModelCooldown: vi.fn() }));

vi.mock("@code-proxy/api-client", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@code-proxy/api-client")>();
  return {
    ...mod,
    authFilesApi: { ...mod.authFilesApi, clearModelCooldown: mocks.clearModelCooldown },
  };
});

const wrapper = ({ children }: { children: ReactNode }) => <ToastProvider>{children}</ToastProvider>;

const file = (extra: Record<string, unknown> = {}): AuthFileItem => ({
  name: "codex-1.json",
  type: "codex",
  auth_index: "auth-1",
  ...extra,
});

describe("useAuthFileModelCooldownActions", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    // The toast store is global: a toast left over from the previous test must not be on screen.
    toast.dismiss();
    mocks.clearModelCooldown.mockReset();
    mocks.clearModelCooldown.mockResolvedValue({ changed: true });
  });

  afterEach(() => {
    cleanup();
    toast.dismiss();
  });

  test("two activations of the same model before the first finishes send one request", async () => {
    let finish: (value: { changed: boolean }) => void = () => undefined;
    mocks.clearModelCooldown.mockReturnValue(
      new Promise<{ changed: boolean }>((resolve) => {
        finish = resolve;
      }),
    );
    const refresh = vi.fn(async (files: AuthFileItem[]) => files);
    const { result } = renderHook(() => useAuthFileModelCooldownActions({ refreshFilesForItems: refresh }), {
      wrapper,
    });

    let first: Promise<void> = Promise.resolve();
    let second: Promise<void> = Promise.resolve();
    act(() => {
      first = result.current.retryModel(file(), "gpt-5.5");
      second = result.current.retryModel(file(), "gpt-5.5");
    });
    expect(mocks.clearModelCooldown).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current.retrying.has(modelCooldownKey("codex-1.json", "gpt-5.5"))).toBe(true));

    await act(async () => {
      finish({ changed: true });
      await Promise.all([first, second]);
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(result.current.retrying.size).toBe(0);
  });

  test("different models, and the same model on different accounts, do not block each other", async () => {
    const refresh = vi.fn(async (files: AuthFileItem[]) => files);
    const { result } = renderHook(() => useAuthFileModelCooldownActions({ refreshFilesForItems: refresh }), {
      wrapper,
    });

    await act(async () => {
      await Promise.all([
        result.current.retryModel(file(), "gpt-5.5"),
        result.current.retryModel(file(), "gpt-5.4"),
        result.current.retryModel(file({ name: "codex-2.json", auth_index: "auth-2" }), "gpt-5.5"),
      ]);
    });
    expect(mocks.clearModelCooldown).toHaveBeenCalledTimes(3);
    expect(mocks.clearModelCooldown).toHaveBeenCalledWith({ authIndex: "auth-2", model: "gpt-5.5" });
  });

  test("a model can be retried again once the first attempt is over", async () => {
    mocks.clearModelCooldown.mockRejectedValueOnce(new Error("boom"));
    const refresh = vi.fn(async (files: AuthFileItem[]) => files);
    const { result } = renderHook(() => useAuthFileModelCooldownActions({ refreshFilesForItems: refresh }), {
      wrapper,
    });

    await act(async () => {
      await result.current.retryModel(file(), "gpt-5.5");
    });
    expect(result.current.retrying.size).toBe(0);
    await act(async () => {
      await result.current.retryModel(file(), "gpt-5.5");
    });
    expect(mocks.clearModelCooldown).toHaveBeenCalledTimes(2);
  });

  test("an account the backend cannot look up is reported without sending anything", async () => {
    const refresh = vi.fn(async (files: AuthFileItem[]) => files);
    const { result } = renderHook(() => useAuthFileModelCooldownActions({ refreshFilesForItems: refresh }), {
      wrapper,
    });

    await act(async () => {
      await result.current.retryModel(file({ auth_index: undefined }), "gpt-5.5");
    });
    expect(mocks.clearModelCooldown).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    expect(await screen.findByText(/Failed to retry "gpt-5\.5" on "codex-1\.json"/)).toBeInTheDocument();
  });

  test("falls back to a generic message when the failure carries none", async () => {
    mocks.clearModelCooldown.mockRejectedValue("nope");
    const { result } = renderHook(
      () => useAuthFileModelCooldownActions({ refreshFilesForItems: vi.fn(async (files: AuthFileItem[]) => files) }),
      { wrapper },
    );
    await act(async () => {
      await result.current.retryModel(file(), "gpt-5.5");
    });
    expect(await screen.findByText(/Failed to retry "gpt-5\.5" on "codex-1\.json": /)).toBeInTheDocument();
  });
});
