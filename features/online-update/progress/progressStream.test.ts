import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { UpdateProgressResponse } from "@code-proxy/api-client/endpoints/update";

const mocks = vi.hoisted(() => ({
  events: vi.fn(),
  progress: vi.fn(),
}));

vi.mock("@code-proxy/api-client/endpoints/update", () => ({
  updateApi: {
    events: mocks.events,
    progress: mocks.progress,
  },
}));

const { subscribeUpdateProgress, __resetUpdateProgressStream } = await import("./progressStream");

const running = (overrides: Partial<UpdateProgressResponse> = {}): UpdateProgressResponse => ({
  status: "running",
  run_id: 1,
  event_id: 1,
  progress_percent: 10,
  ...overrides,
});

/** Resolves once the predicate holds, so tests never depend on fixed sleeps. */
const until = async (predicate: () => boolean) => {
  await vi.waitFor(() => expect(predicate()).toBe(true), { timeout: 4000, interval: 10 });
};

describe("update progress transport", () => {
  beforeEach(() => {
    mocks.events.mockReset();
    mocks.progress.mockReset();
    mocks.progress.mockRejectedValue(new Error("offline"));
    __resetUpdateProgressStream();
  });

  afterEach(() => {
    __resetUpdateProgressStream();
  });

  test("delivers streamed progress to subscribers", async () => {
    mocks.events.mockImplementation(async (onProgress: (p: UpdateProgressResponse) => void) => {
      onProgress(running({ progress_percent: 42 }));
      await new Promise(() => {});
    });

    const seen: UpdateProgressResponse[] = [];
    const unsubscribe = subscribeUpdateProgress((snapshot) => {
      if (snapshot.progress) seen.push(snapshot.progress);
    });

    await until(() => seen.some((p) => p.progress_percent === 42));
    unsubscribe();
  });

  /**
   * The regression that made online update look broken: applying an update recreates
   * the container serving this stream, so it always drops. The old backoff started
   * at 5s and doubled to 60s, so the modal froze for the whole restart. Reconnects
   * must be fast enough to be invisible — while a run is in flight, which is what
   * the poll below establishes before the reconnects are counted.
   */
  test("reconnects quickly after the stream drops during a run", async () => {
    mocks.events.mockRejectedValue(new Error("container restarting"));
    mocks.progress.mockResolvedValue(running());

    const unsubscribe = subscribeUpdateProgress(() => {});
    await until(() => mocks.events.mock.calls.length >= 3);

    unsubscribe();
  });

  /**
   * The other half of that trade. Panels sit open for hours with nothing being
   * updated, and on a deployment without the updater sidecar every request fails;
   * reconnecting three times a second for days is pure load, and each failed poll
   * used to write an audit row.
   */
  test("backs off instead of hammering while nothing is in flight", async () => {
    mocks.events.mockRejectedValue(new Error("no updater"));
    mocks.progress.mockRejectedValue(new Error("no updater"));

    const unsubscribe = subscribeUpdateProgress(() => {});
    // One connect attempt lands immediately; the idle backoff starts at 3s, so a
    // second attempt inside a second would mean the aggressive cadence is still on.
    await until(() => mocks.events.mock.calls.length >= 1);
    await new Promise((resolve) => globalThis.setTimeout(resolve, 1000));
    expect(mocks.events.mock.calls.length).toBeLessThanOrEqual(2);
    // The idle poll cadence is 30s, so the immediate poll must be the only one.
    expect(mocks.progress.mock.calls.length).toBe(1);

    unsubscribe();
  });

  /**
   * A refusal is not a transient failure: the operator lacks the permission the
   * update endpoints require, and retrying only fills the audit log.
   */
  test("stops entirely once the server refuses the operator", async () => {
    const forbidden = Object.assign(new Error("permission denied"), { status: 403 });
    mocks.events.mockRejectedValue(forbidden);
    mocks.progress.mockRejectedValue(forbidden);

    const unsubscribe = subscribeUpdateProgress(() => {});
    await until(() => mocks.progress.mock.calls.length >= 1);
    const callsAfterRefusal = mocks.events.mock.calls.length + mocks.progress.mock.calls.length;

    await new Promise((resolve) => globalThis.setTimeout(resolve, 500));
    expect(mocks.events.mock.calls.length + mocks.progress.mock.calls.length).toBe(
      callsAfterRefusal,
    );

    unsubscribe();
  });

  /** A dropped stream is a normal part of an update, not a failure to surface. */
  test("reports the link as reconnecting while the stream is unavailable", async () => {
    mocks.events.mockRejectedValue(new Error("container restarting"));

    let link = "";
    const unsubscribe = subscribeUpdateProgress((snapshot) => {
      link = snapshot.link;
    });

    await until(() => link === "reconnecting");
    unsubscribe();
  });

  /**
   * Polling covers the gap while the stream is down, and also the case where a
   * buffering proxy means the stream never delivers anything at all.
   */
  test("falls back to polling when the stream is unavailable", async () => {
    mocks.events.mockRejectedValue(new Error("no stream"));
    mocks.progress.mockResolvedValue(running({ progress_percent: 63 }));

    let latest: UpdateProgressResponse | null = null;
    const unsubscribe = subscribeUpdateProgress((snapshot) => {
      latest = snapshot.progress;
    });

    await until(() => latest?.progress_percent === 63);
    expect(mocks.progress).toHaveBeenCalled();
    unsubscribe();
  });

  /** A reconnect must resume, not restart, or it lands in a hole. */
  test("resumes from the last event id after reconnecting", async () => {
    let call = 0;
    mocks.events.mockImplementation(
      async (onProgress: (p: UpdateProgressResponse) => void) => {
        call += 1;
        if (call === 1) {
          onProgress(running({ event_id: 7 }));
          throw new Error("container restarting");
        }
        await new Promise(() => {});
      },
    );

    const unsubscribe = subscribeUpdateProgress(() => {});
    await until(() => mocks.events.mock.calls.length >= 2);

    const [, options] = mocks.events.mock.calls[1];
    expect(options?.params).toEqual({ last_event_id: "7" });
    unsubscribe();
  });

  /**
   * Polling and streaming run concurrently during a reconnect, so a poll issued
   * earlier can resolve after a newer event has already arrived. Without an ordering
   * guard the bar visibly jumps backwards.
   */
  test("ignores progress that is older than what is already held", async () => {
    mocks.events.mockImplementation(async (onProgress: (p: UpdateProgressResponse) => void) => {
      onProgress(running({ event_id: 10, progress_percent: 80 }));
      onProgress(running({ event_id: 4, progress_percent: 20 }));
      await new Promise(() => {});
    });

    const percentages: number[] = [];
    const unsubscribe = subscribeUpdateProgress((snapshot) => {
      if (typeof snapshot.progress?.progress_percent === "number") {
        percentages.push(snapshot.progress.progress_percent);
      }
    });

    await until(() => percentages.includes(80));
    expect(percentages).not.toContain(20);
    unsubscribe();
  });

  /** A panel opened mid-update must render immediately, not after the next event. */
  test("fetches current state on subscribe instead of waiting for an event", async () => {
    mocks.events.mockImplementation(async () => {
      await new Promise(() => {});
    });
    mocks.progress.mockResolvedValue(running({ progress_percent: 31 }));

    let latest: UpdateProgressResponse | null = null;
    const unsubscribe = subscribeUpdateProgress((snapshot) => {
      latest = snapshot.progress;
    });

    await until(() => latest?.progress_percent === 31);
    unsubscribe();
  });

  test("stops all work once the last subscriber leaves", async () => {
    mocks.events.mockRejectedValue(new Error("offline"));

    const unsubscribe = subscribeUpdateProgress(() => {});
    await until(() => mocks.events.mock.calls.length >= 2);
    unsubscribe();

    const callsAtUnsubscribe = mocks.events.mock.calls.length;
    await new Promise((resolve) => globalThis.setTimeout(resolve, 300));
    expect(mocks.events.mock.calls.length).toBeLessThanOrEqual(callsAtUnsubscribe + 1);
  });
});
