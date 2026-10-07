import { render, screen, waitFor, within } from "@testing-library/react";
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
    // 错误就地显示在提示词下面，焦点也送回提示词——以前只弹一条 toast，看完还得自己找是哪一项。
    const promptInput = screen.getByRole("textbox", { name: "提示词" });
    expect(await screen.findByText("这一项必填")).toBeInTheDocument();
    expect(promptInput).toHaveAttribute("aria-invalid", "true");
    await waitFor(() => expect(promptInput).toHaveFocus());
  });

  test("asks for a valid source image in image-to-video mode and submits with the shortcut", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "测试生成" }));
    const dialog = await screen.findByRole("dialog", { name: "测试视频生成" });
    // 文生视频不发送源图，所以不显示这一项。
    expect(within(dialog).queryByRole("textbox", { name: "源图地址" })).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole("radio", { name: "图生视频" }));
    // 弹窗里切换方式，页面上的文档页签跟着切过去。
    expect(screen.getByRole("tab", { name: "图生视频" })).toHaveAttribute("aria-selected", "true");

    const imageInput = within(dialog).getByRole("textbox", { name: "源图地址" });
    await user.type(within(dialog).getByRole("textbox", { name: "提示词" }), "镜头推近");
    await user.type(imageInput, "still.png");
    await user.click(within(dialog).getByRole("button", { name: "开始生成" }));

    expect(startTaskMock()).not.toHaveBeenCalled();
    expect(within(dialog).getByText(/请输入完整的网址/)).toBeInTheDocument();

    await user.clear(imageInput);
    await user.type(imageInput, "https://example.com/still.png");
    await user.keyboard("{Meta>}{Enter}{/Meta}");

    await waitFor(() => expect(startTaskMock()).toHaveBeenCalledTimes(1));
    expect(startTaskMock().mock.calls[0][0]).toMatchObject({
      prompt: "镜头推近",
      image: "https://example.com/still.png",
      duration: 6,
    });
  });

  // Screenshot regression: with no xAI credential the page still offered a live
  // button, and the request died deep in the router with "auth_not_found".
  test("disables generation when the tenant has no credential for the model", async () => {
    getModelsMock().mockResolvedValue({
      models: [{ ...videoModel, available: false, channels: [] }],
      channels: [],
    });
    renderPage();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "测试生成" })).toBeDisabled(),
    );
    expect(screen.getByText(/没有可用的 xAI 账号/)).toBeInTheDocument();
  });

  test("keeps generation enabled when the server omits availability", async () => {
    // An older server does not send the field; absence must not disable the page.
    getModelsMock().mockResolvedValue({ models: [videoModel] });
    renderPage();

    await waitFor(() => expect(screen.getByRole("button", { name: "测试生成" })).toBeEnabled());
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
