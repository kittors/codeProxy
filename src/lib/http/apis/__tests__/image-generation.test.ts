import { describe, expect, test, vi, beforeEach } from "vitest";

const postMock = vi.fn();
const postFormMock = vi.fn();

vi.mock("@/lib/http/client", () => ({
  apiClient: {
    post: postMock,
    postForm: postFormMock,
  },
}));

describe("imageGenerationApi", () => {
  beforeEach(() => {
    postMock.mockReset();
    postFormMock.mockReset();
  });

  test("uses a frontend timeout longer than backend polling for text generation", async () => {
    const { imageGenerationApi } = await import("@/lib/http/apis/image-generation");

    postMock.mockResolvedValue({ created: 1, data: [] });

    await imageGenerationApi.test({
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
      expect.objectContaining({
        timeoutMs: 360000,
      }),
    );
  });

  test("uses the same extended timeout for multipart image generation tests", async () => {
    const { imageGenerationApi } = await import("@/lib/http/apis/image-generation");

    postFormMock.mockResolvedValue({ created: 1, data: [] });
    const imageFile = new File(["hello"], "ref.png", { type: "image/png" });

    await imageGenerationApi.test({
      mode: "edits",
      model: "gpt-image-2",
      prompt: "turn it green",
      images: [imageFile],
    });

    expect(postFormMock).toHaveBeenCalledWith(
      "/image-generation/test",
      expect.any(FormData),
      expect.objectContaining({
        timeoutMs: 360000,
      }),
    );
  });
});
