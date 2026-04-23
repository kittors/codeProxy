import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@/i18n";
import { authFilesApi, imageGenerationApi } from "@/lib/http/apis";
import { ImageGenerationPage } from "@/modules/image-generation/ImageGenerationPage";
import { ThemeProvider } from "@/modules/ui/ThemeProvider";
import { ToastProvider } from "@/modules/ui/ToastProvider";

const authFilesListMock = () => vi.mocked(authFilesApi.list);
const imageGenerationTestMock = () => vi.mocked(imageGenerationApi.test);

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ThemeProvider>
        <ToastProvider>
          <ImageGenerationPage />
        </ToastProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

describe("ImageGenerationPage", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-CN");
    vi.spyOn(authFilesApi, "list");
    vi.spyOn(imageGenerationApi, "test");
    authFilesListMock().mockResolvedValue({
      files: [
        {
          name: "codex-a.json",
          type: "codex",
          account_type: "oauth",
          label: "设计号 A",
        },
        {
          name: "codex-b.json",
          provider: "codex",
          account_type: "oauth",
          label: "设计号 B",
        },
        {
          name: "gemini.json",
          type: "gemini-cli",
          account_type: "oauth",
          label: "Gemini 账号",
        },
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("renders text-to-image and image-to-image call docs with structured endpoint tables", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByRole("tab", { name: "gpt-image-2" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "生图模型" })).toBeInTheDocument();
    const callCard = screen.getByText("调用方式").closest("section");
    expect(callCard).not.toBeNull();
    expect(screen.getByRole("tab", { name: "文生图" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "图生图" })).toBeInTheDocument();
    expect(within(callCard as HTMLElement).getByText("POST")).toBeInTheDocument();
    expect(within(callCard as HTMLElement).getByText("/v1/images/generations")).toBeInTheDocument();
    expect(screen.getByText("请求参数")).toBeInTheDocument();
    expect(screen.getByText("返回结构")).toBeInTheDocument();
    expect(within(callCard as HTMLElement).getByText("size")).toBeInTheDocument();
    expect(within(callCard as HTMLElement).getByText("quality")).toBeInTheDocument();
    expect(within(callCard as HTMLElement).getByText("n")).toBeInTheDocument();
    expect(screen.getByText(/"size": "1024x1024"/)).toBeInTheDocument();
    expect(screen.getByText(/"quality": "high"/)).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "图生图" }));
    expect(screen.getByText("/v1/images/edits")).toBeInTheDocument();
    expect(screen.getByText("image")).toBeInTheDocument();
    expect(screen.getByText("multipart/form-data")).toBeInTheDocument();
    expect(screen.queryByText("BaseURL")).not.toBeInTheDocument();
    expect(screen.getByText(/Authorization: Bearer YOUR_API_KEY/)).toBeInTheDocument();
    expect(screen.getByText(/-F "image=@\/path\/to\/image.png"/)).toBeInTheDocument();
    expect(within(callCard as HTMLElement).getByRole("button", { name: "测试生成" })).toBeEnabled();
    expect(
      screen.queryByText("查看 gpt-image-2 的调用方式、当前使用渠道，并直接发起测试生成。"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("测试调用会自动轮询当前可用渠道。")).not.toBeInTheDocument();
    expect(screen.queryByText("设计号 A")).not.toBeInTheDocument();
    expect(screen.queryByText("设计号 B")).not.toBeInTheDocument();
    expect(screen.queryByText("Gemini 账号")).not.toBeInTheDocument();
  });

  test("opens the redesigned modal, shows upload entry and uses a round send button", async () => {
    const user = userEvent.setup();
    const deferred = createDeferred<{
      created: number;
      data: Array<{ b64_json: string; revised_prompt: string }>;
    }>();
    imageGenerationTestMock().mockReturnValue(deferred.promise);

    renderPage();

    await screen.findByRole("tab", { name: "gpt-image-2" });
    await user.click(screen.getByRole("button", { name: "测试生成" }));

    const dialog = await screen.findByRole("dialog", { name: "测试生成" });
    expect(dialog.className).toContain("max-w-[640px]");
    expect(dialog.className).not.toContain("w-[78vw]");
    expect(dialog.className).not.toContain("min-w-[720px]");
    expect(within(dialog).getByTestId("image-generation-stage")).toBeInTheDocument();
    expect(within(dialog).getByTestId("image-generation-composer")).toBeInTheDocument();
    expect(within(dialog).queryByText("准备创建图片")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("正在生成图片")).not.toBeInTheDocument();
    expect(within(dialog).getByText("输入提示词后开始生成图片")).toBeInTheDocument();
    expect(within(dialog).getByRole("textbox", { name: "提示词" })).toBeInTheDocument();
    expect(within(dialog).getByRole("tab", { name: "文生图" })).toBeInTheDocument();
    expect(within(dialog).getByRole("tab", { name: "图生图" })).toBeInTheDocument();
    expect(within(dialog).getByRole("combobox", { name: "分辨率" })).toBeInTheDocument();
    expect(within(dialog).getByRole("combobox", { name: "质量" })).toBeInTheDocument();
    expect(within(dialog).getByRole("combobox", { name: "生成数量" })).toBeInTheDocument();
    expect(within(dialog).getByLabelText("上传图片")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "发送" })).toBeVisible();
    expect(within(dialog).getByTestId("image-generation-stage")).toHaveClass("bg-slate-50");
    expect(dialog.querySelector(".image-generation-dots-layer")).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole("combobox", { name: "分辨率" }));
    await user.click(await screen.findByRole("option", { name: "1024x1792" }));
    await user.click(within(dialog).getByRole("combobox", { name: "质量" }));
    await user.click(await screen.findByRole("option", { name: "high" }));
    await user.click(within(dialog).getByRole("combobox", { name: "生成数量" }));
    await user.click(await screen.findByRole("option", { name: "2 张" }));

    await user.type(within(dialog).getByPlaceholderText(/输入提示词/i), "画一只狐狸");
    vi.useFakeTimers();
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "发送" }));
    });

    expect(imageGenerationTestMock()).toHaveBeenCalledWith({
      mode: "generations",
      model: "gpt-image-2",
      prompt: "画一只狐狸",
      quality: "high",
      size: "1024x1792",
      n: 2,
    });

    expect(within(dialog).getByText("正在打草稿")).toBeInTheDocument();
    expect(within(dialog).getByTestId("image-generation-stage")).toHaveClass("bg-slate-50");
    expect(dialog.querySelectorAll(".image-generation-dots-layer")).toHaveLength(1);
    expect(dialog.querySelectorAll(".image-generation-flow-layer")).toHaveLength(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1800);
    });
    expect(within(dialog).getByText("正在生成图片")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1800);
    });
    expect(within(dialog).getByText("正在细化细节")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1800);
    });
    expect(within(dialog).getByText("开始生成")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3600);
    });
    expect(within(dialog).getByText("开始生成")).toBeInTheDocument();
    expect(within(dialog).queryByText("正在打草稿")).not.toBeInTheDocument();

    vi.useRealTimers();

    await act(async () => {
      deferred.resolve({
        created: 1,
        data: [
          {
            b64_json: "aGVsbG8=",
            revised_prompt: "修订提示词",
          },
          {
            b64_json: "d29ybGQ=",
            revised_prompt: "第二张",
          },
        ],
      });
    });

    const image = await within(dialog).findByRole("img", { name: /gpt-image-2 预览/i });
    expect(image).toHaveAttribute(
      "src",
      "data:image/png;base64,aGVsbG8=",
    );
    expect(within(dialog).getByRole("button", { name: "第 1 张" })).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "第 2 张" }));
    expect(image).toHaveAttribute("src", "data:image/png;base64,d29ybGQ=");
    expect(within(dialog).getByTestId("image-generation-result-scroll")).toHaveClass("overflow-auto");
    expect(image).toHaveClass("w-full");
    expect(within(dialog).getByText("第二张")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "点击预览" })).toBeVisible();

    await user.click(image);
    const preview = await screen.findByRole("dialog", { name: "图片预览" });
    expect(preview).toHaveAttribute("data-variant", "image-only");
    expect(preview).not.toHaveClass("max-w-[860px]");
    expect(within(preview).getByRole("img", { name: /gpt-image-2 预览/i })).toHaveClass("max-w-none");
  });

  test("supports uploading up to five temporary images, previewing them, deleting them, and sending all kept images", async () => {
    const user = userEvent.setup();
    imageGenerationTestMock().mockResolvedValue({
      created: 1,
      data: [{ b64_json: "aGVsbG8=", revised_prompt: "图生图结果" }],
    });

    renderPage();

    await screen.findByRole("tab", { name: "gpt-image-2" });
    await user.click(screen.getByRole("button", { name: "测试生成" }));

    const dialog = await screen.findByRole("dialog", { name: "测试生成" });
    await user.click(within(dialog).getByRole("tab", { name: "图生图" }));

    const files = [
      new File(["a"], "1.png", { type: "image/png" }),
      new File(["b"], "2.png", { type: "image/png" }),
      new File(["c"], "3.png", { type: "image/png" }),
      new File(["d"], "4.png", { type: "image/png" }),
      new File(["e"], "5.png", { type: "image/png" }),
      new File(["f"], "6.png", { type: "image/png" }),
    ];
    await user.upload(within(dialog).getByLabelText("上传图片"), files);
    expect(within(dialog).getAllByTestId("image-generation-upload-chip")).toHaveLength(5);
    expect(within(dialog).queryByText("6.png")).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "预览图片 1.png" }));
    const uploadPreview = await screen.findByRole("dialog", { name: "图片预览" });
    expect(uploadPreview).toBeInTheDocument();
    await user.click(within(uploadPreview).getByRole("button", { name: "关闭" }));

    await user.click(within(dialog).getByRole("button", { name: "删除图片 5.png" }));
    expect(within(dialog).getAllByTestId("image-generation-upload-chip")).toHaveLength(4);
    await user.type(within(dialog).getByPlaceholderText(/输入提示词/i), "改成蓝色图标");
    await user.click(within(dialog).getByRole("combobox", { name: "生成数量" }));
    await user.click(await screen.findByRole("option", { name: "2 张" }));
    await user.click(within(dialog).getByRole("button", { name: "发送" }));

    expect(imageGenerationTestMock()).toHaveBeenCalledWith({
      mode: "edits",
      model: "gpt-image-2",
      prompt: "改成蓝色图标",
      size: "1024x1024",
      quality: "medium",
      n: 2,
      images: files.slice(0, 4),
    });
    expect(await within(dialog).findByText("图生图结果")).toBeInTheDocument();
  });

  test("greys the preview area and shows the error message inside the modal when generation fails", async () => {
    imageGenerationTestMock().mockRejectedValue(new Error("上游图片生成失败"));

    renderPage();

    await screen.findByRole("tab", { name: "gpt-image-2" });
    await userEvent.click(screen.getByRole("button", { name: "测试生成" }));

    const dialog = await screen.findByRole("dialog", { name: "测试生成" });
    await userEvent.type(within(dialog).getByPlaceholderText(/输入提示词/i), "画一只狐狸");
    await userEvent.click(within(dialog).getByRole("button", { name: "发送" }));

    expect(await within(dialog).findByText("上游图片生成失败")).toBeInTheDocument();
    expect(within(dialog).getByTestId("image-generation-preview")).toHaveClass("bg-slate-100");
  });

  test("greys related actions and shows the empty hint when no codex oauth channel is configured", async () => {
    authFilesListMock().mockResolvedValue({
      files: [
        {
          name: "gemini.json",
          type: "gemini-cli",
          account_type: "oauth",
          label: "Gemini 账号",
        },
      ],
    });

    renderPage();

    expect(await screen.findByText("当前没有可用于 gpt-image-2 的渠道。")).toBeInTheDocument();
    const callCard = screen.getByText("调用方式").closest("section");
    expect(within(callCard as HTMLElement).getByRole("button", { name: "测试生成" })).toBeDisabled();
    expect(screen.getByTestId("image-generation-disabled-state")).toHaveClass("opacity-60");
  });
});
