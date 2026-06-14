import { describe, expect, test, vi, beforeEach } from "vitest";

const postMock = vi.fn();
const postFormMock = vi.fn();
const getMock = vi.fn();
const putMock = vi.fn();

vi.mock("../../client/client", () => ({
  apiClient: {
    get: getMock,
    post: postMock,
    postForm: postFormMock,
    put: putMock,
  },
}));

describe("imageGenerationApi", () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
    postFormMock.mockReset();
    putMock.mockReset();
  });

  test("loads image generation size presets", async () => {
    const { imageGenerationApi } =
      await import("@code-proxy/api-client/endpoints/image-generation");

    getMock.mockResolvedValue({ sizes: ["1024x1024", "4096x2304"] });

    await imageGenerationApi.getSizePresets();

    expect(getMock).toHaveBeenCalledWith("/image-generation/size-presets");
  });

  test("updates image generation size presets", async () => {
    const { imageGenerationApi } =
      await import("@code-proxy/api-client/endpoints/image-generation");

    putMock.mockResolvedValue({ sizes: ["1024x1024", "4096x2304"] });

    await imageGenerationApi.updateSizePresets(["1024x1024", "4096x2304"]);

    expect(putMock).toHaveBeenCalledWith("/image-generation/size-presets", {
      sizes: ["1024x1024", "4096x2304"],
    });
  });

  test("creates a background task for text generation tests", async () => {
    const { imageGenerationApi } =
      await import("@code-proxy/api-client/endpoints/image-generation");

    postMock.mockResolvedValue({ task_id: "task-1", status: "queued" });

    await imageGenerationApi.startTestTask({
      mode: "generations",
      model: "gpt-image-2",
      prompt: "draw a fox",
    });

    expect(postMock).toHaveBeenCalledWith("/image-generation/test", {
      model: "gpt-image-2",
      prompt: "draw a fox",
    });
  });

  test("creates a background task for multipart image generation tests", async () => {
    const { imageGenerationApi } =
      await import("@code-proxy/api-client/endpoints/image-generation");

    postFormMock.mockResolvedValue({ task_id: "task-2", status: "queued" });
    const imageFile = new File(["hello"], "ref.png", { type: "image/png" });

    await imageGenerationApi.startTestTask({
      mode: "edits",
      model: "gpt-image-2",
      prompt: "turn it green",
      images: [imageFile],
    });

    expect(postFormMock).toHaveBeenCalledWith("/image-generation/test", expect.any(FormData));
  });

  test("polls image generation test task status with a short request timeout", async () => {
    const { imageGenerationApi } =
      await import("@code-proxy/api-client/endpoints/image-generation");

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
