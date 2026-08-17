import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@code-proxy/i18n";
import { videoGenerationApi } from "@code-proxy/api-client";
import { ThemeProvider, ToastProvider } from "@code-proxy/ui";
import { VideoGenerationPage } from "../VideoGenerationPage";

const getModelsMock = () => videoGenerationApi.getModels as unknown as ReturnType<typeof vi.fn>;
const startTaskMock = () => videoGenerationApi.startTestTask as unknown as ReturnType<typeof vi.fn>;
const getTaskMock = () => videoGenerationApi.getTestTask as unknown as ReturnType<typeof vi.fn>;

const videoModel = {
  id: "grok-imagine-video-1.5",
  provider: "xai",
  display_name: "Grok Imagine Video",
  description: "Grok Imagine text-to-video and image-to-video generation.",
  supports_image_to_video: true,
  max_duration_seconds: 15,
};

function renderPage() {
  return render(
    <MemoryRouter>
      <ThemeProvider>
        <ToastProvider>
          <VideoGenerationPage />
        </ToastProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

describe("VideoGenerationPage", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-CN");
    vi.restoreAllMocks();
    vi.spyOn(videoGenerationApi, "getModels");
    vi.spyOn(videoGenerationApi, "startTestTask");
    vi.spyOn(videoGenerationApi, "getTestTask");
    getModelsMock().mockResolvedValue({ models: [videoModel] });
    startTaskMock().mockResolvedValue({ task_id: "task-1", status: "queued" });
    getTaskMock().mockResolvedValue({ task_id: "task-1", status: "queued" });
  });

  test("documents the two-step async call for text and image modes", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByRole("heading", { name: "视频模型" })).toBeInTheDocument();

    // The snippet is syntax-highlighted, so its text lives across token spans.
    const codeBlock = document.querySelector("[data-code-block]") as HTMLElement;
    expect(codeBlock.textContent).toContain("curl http://127.0.0.1:8317/v1/videos/generations");
    // The polling half is the part callers miss; it must be in the example.
    expect(codeBlock.textContent).toContain("/v1/videos/$REQUEST_ID");

    await user.click(screen.getByRole("tab", { name: "图生视频" }));

    await waitFor(() => {
      const imageBlock = document.querySelector("[data-code-block]") as HTMLElement;
      expect(imageBlock.textContent).toContain('"image": { "url"');
    });
  });

  test("offers the catalog's video models and submits a generation task", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "测试生成" }));

    await waitFor(() => expect(screen.getByText("测试视频生成")).toBeInTheDocument());
    await user.type(screen.getByPlaceholderText(/日落时分的海浪/), "海浪");
    await user.click(screen.getByRole("button", { name: "开始生成" }));

    await waitFor(() => expect(startTaskMock()).toHaveBeenCalled());
    const payload = startTaskMock().mock.calls[0][0] as Record<string, unknown>;
    expect(payload.model).toBe("grok-imagine-video-1.5");
    expect(payload.prompt).toBe("海浪");
    expect(payload.duration).toBeGreaterThan(0);
  });

  test("refuses to submit without a prompt", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "测试生成" }));
    await waitFor(() => expect(screen.getByText("测试视频生成")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "开始生成" }));

    expect(startTaskMock()).not.toHaveBeenCalled();
    // The toast renders both a visible node and a live-region copy for screen
    // readers, so match on presence rather than uniqueness.
    expect((await screen.findAllByText("请填写提示词")).length).toBeGreaterThan(0);
  });

  test("plays the clip once the task finishes", async () => {
    const user = userEvent.setup();
    getTaskMock().mockResolvedValue({
      task_id: "task-1",
      status: "succeeded",
      result: { status: "done", video: { url: "https://vidgen.example/clip.mp4", duration: 6 } },
    });
    renderPage();

    await user.click(await screen.findByRole("button", { name: "测试生成" }));
    await waitFor(() => expect(screen.getByText("测试视频生成")).toBeInTheDocument());
    await user.type(screen.getByPlaceholderText(/日落时分的海浪/), "海浪");
    await user.click(screen.getByRole("button", { name: "开始生成" }));

    await waitFor(() => {
      const video = document.querySelector("video");
      expect(video?.getAttribute("src")).toBe("https://vidgen.example/clip.mp4");
    });
  });
});
