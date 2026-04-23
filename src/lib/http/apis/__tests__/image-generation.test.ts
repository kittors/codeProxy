import { describe, expect, test, vi, beforeEach } from "vitest";

const postMock = vi.fn();
const postFormMock = vi.fn();
const getMock = vi.fn();

vi.mock("@/lib/http/client", () => ({
  apiClient: {
    get: getMock,
    post: postMock,
    postForm: postFormMock,
  },
}));

describe("imageGenerationApi", () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
    postFormMock.mockReset();
  });

  test("creates a background task for text generation tests", async () => {
    const { imageGenerationApi } = await import("@/lib/http/apis/image-generation");

    postMock.mockResolvedValue({ task_id: "task-1", status: "queued" });

    await imageGenerationApi.startTestTask({
      mode: "generations",
      model: "gpt-image-2",
      prompt: "draw a fox",
    });

    expect(postMock).toHaveBeenCalledWith(
      "/image-generation/test",
      {
        model: "gpt-image-2",
        prompt: "draw a fox",
      },
    );
  });

  test("creates a background task for multipart image generation tests", async () => {
    const { imageGenerationApi } = await import("@/lib/http/apis/image-generation");

    postFormMock.mockResolvedValue({ task_id: "task-2", status: "queued" });
    const imageFile = new File(["hello"], "ref.png", { type: "image/png" });

    await imageGenerationApi.startTestTask({
      mode: "edits",
      model: "gpt-image-2",
      prompt: "turn it green",
      images: [imageFile],
    });

    expect(postFormMock).toHaveBeenCalledWith(
      "/image-generation/test",
      expect.any(FormData),
    );
  });

  test("polls image generation test task status with a short request timeout", async () => {
    const { imageGenerationApi } = await import("@/lib/http/apis/image-generation");

    getMock.mockResolvedValue({ task_id: "task-1", status: "succeeded" });

    await imageGenerationApi.getTestTask("task-1");

    expect(getMock).toHaveBeenCalledWith(
      "/image-generation/test/task-1",
      expect.objectContaining({
        timeoutMs: 10000,
      }),
    );
  });
});
