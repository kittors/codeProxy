import { beforeEach, describe, expect, test, vi } from "vitest";

const getMock = vi.fn();
const postMock = vi.fn();

vi.mock("../../client/client", () => ({
  apiClient: {
    get: getMock,
    post: postMock,
  },
}));

describe("modelTestApi", () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
  });

  // The poll that sees an image probe finish downloads the image as base64. On a
  // slow link that takes far longer than the 10s the poll used to allow, which
  // discarded images the account had already paid for.
  test("gives the task poll room to download a finished image", async () => {
    const { modelTestApi } = await import("@code-proxy/api-client/endpoints/model-test");

    getMock.mockResolvedValue({ ok: true, task_id: "task-1", status: "succeeded" });

    await modelTestApi.getTask("task-1");

    expect(getMock).toHaveBeenCalledWith(
      "/models/test/task-1",
      expect.objectContaining({ timeoutMs: expect.any(Number) }),
    );
    const { timeoutMs } = getMock.mock.calls[0][1] as { timeoutMs: number };
    expect(timeoutMs).toBeGreaterThanOrEqual(5 * 60 * 1000);
  });
});
