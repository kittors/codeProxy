import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ApiClientError, type AccessFreeze } from "@code-proxy/api-client";
import { useAccessFreezeOverview } from "../useAccessFreezeOverview";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
}));

vi.mock("@code-proxy/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@code-proxy/api-client")>()),
  accessFreezesApi: { list: mocks.list },
}));

const freeze = (id: number, kind: string, subjectId: string, provider = "codex"): AccessFreeze => ({
  id,
  subject: { tenant_id: "t1", kind, id: subjectId },
  subject_name: "",
  provider,
  provider_name: provider === "codex" ? "Codex" : "Claude",
  reason_code: "cyber_policy",
  upstream_message: "flagged",
  model: "gpt-6",
  strike_count: 1,
  frozen_at: "2026-11-13T02:00:00Z",
  notice: "frozen",
});

describe("useAccessFreezeOverview", () => {
  beforeEach(() => {
    mocks.list.mockResolvedValue([]);
  });

  test("asks nothing on a backend that does not declare the capability", async () => {
    const { result } = renderHook(() => useAccessFreezeOverview(false));
    await act(async () => {
      await result.current.refresh();
    });
    expect(mocks.list).not.toHaveBeenCalled();
    expect(result.current.freezes).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  test("reads the standing freezes once, and sorts them by who is frozen", async () => {
    mocks.list.mockResolvedValue([
      freeze(3, "api_key", "key-9"),
      freeze(2, "end_user", "user-1", "claude"),
      freeze(1, "end_user", "user-1"),
      freeze(4, "something_new", "x"),
    ]);
    const { result } = renderHook(() => useAccessFreezeOverview(true));

    await waitFor(() => expect(result.current.freezes).toHaveLength(4));
    expect(mocks.list).toHaveBeenCalledTimes(1);
    expect(mocks.list).toHaveBeenCalledWith({ status: "active", limit: 1000 });
    expect(result.current.byEndUser.get("user-1")?.map((item) => item.id)).toEqual([2, 1]);
    expect(result.current.apiKeyFreezes.map((item) => item.id)).toEqual([3]);
    // A kind the panel does not know is kept in the list and left out of both groups.
    expect(result.current.byEndUser.has("x")).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.unavailable).toBe(false);
  });

  test("starts reading when the capability appears, and forgets everything when it goes", async () => {
    mocks.list.mockResolvedValue([freeze(1, "end_user", "user-1")]);
    const { result, rerender } = renderHook(({ enabled }) => useAccessFreezeOverview(enabled), {
      initialProps: { enabled: false },
    });
    expect(mocks.list).not.toHaveBeenCalled();

    rerender({ enabled: true });
    await waitFor(() => expect(result.current.freezes).toHaveLength(1));

    rerender({ enabled: false });
    await waitFor(() => expect(result.current.freezes).toEqual([]));
  });

  test("reads again on request, so a release shows at once", async () => {
    mocks.list.mockResolvedValueOnce([freeze(1, "end_user", "user-1")]);
    const { result } = renderHook(() => useAccessFreezeOverview(true));
    await waitFor(() => expect(result.current.freezes).toHaveLength(1));

    mocks.list.mockResolvedValueOnce([]);
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.freezes).toEqual([]);
    expect(mocks.list).toHaveBeenCalledTimes(2);
  });

  test("keeps the reason a read failed, and an empty list: no stale freeze is shown as standing", async () => {
    mocks.list.mockResolvedValueOnce([freeze(1, "end_user", "user-1")]);
    const { result } = renderHook(() => useAccessFreezeOverview(true));
    await waitFor(() => expect(result.current.freezes).toHaveLength(1));

    mocks.list.mockRejectedValueOnce(new Error("offline"));
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.freezes).toEqual([]);
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.unavailable).toBe(false);
  });

  test("a backend without a database says so, and the screen stays away", async () => {
    mocks.list.mockRejectedValue(
      new ApiClientError({
        message: "unavailable",
        status: 503,
        data: { error: { code: "access_freezes_unavailable", message: "unavailable" } },
      }),
    );
    const { result } = renderHook(() => useAccessFreezeOverview(true));
    await waitFor(() => expect(result.current.unavailable).toBe(true));
  });

  test("an answer that arrives after a newer one is not allowed to overwrite it", async () => {
    let resolveSlow: (items: AccessFreeze[]) => void = () => undefined;
    mocks.list.mockImplementationOnce(
      () =>
        new Promise<AccessFreeze[]>((resolve) => {
          resolveSlow = resolve;
        }),
    );
    const { result } = renderHook(() => useAccessFreezeOverview(true));
    await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(1));

    mocks.list.mockResolvedValueOnce([freeze(2, "end_user", "user-2")]);
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.freezes.map((item) => item.id)).toEqual([2]);

    await act(async () => {
      resolveSlow([freeze(1, "end_user", "user-1")]);
    });
    expect(result.current.freezes.map((item) => item.id)).toEqual([2]);
    expect(result.current.loading).toBe(false);
  });
});
