import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@/i18n";
import { authFilesApi, imageGenerationApi } from "@/lib/http/apis";
import { ImageGenerationPage } from "@/modules/image-generation/ImageGenerationPage";
import { ThemeProvider } from "@/modules/ui/ThemeProvider";
import { ToastProvider } from "@/modules/ui/ToastProvider";

const authFilesListMock = () =>
  authFilesApi.list as unknown as ReturnType<typeof vi.fn>;
const imageGenerationTestMock = () =>
  imageGenerationApi.test as unknown as ReturnType<typeof vi.fn>;

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

  test("renders text-to-image call docs with structured endpoint tables", async () => {
    renderPage();

    expect(
      await screen.findByRole("tab", { name: "gpt-image-2" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "生图模型" }),
    ).toBeInTheDocument();
    const callCard = screen.getByText("调用方式").closest("section");
    expect(callCard).not.toBeNull();
    expect(screen.getByRole("tab", { name: "文生图" })).toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: "图生图" }),
    ).not.toBeInTheDocument();
    expect(
      within(callCard as HTMLElement).getByText("POST"),
    ).toBeInTheDocument();
    expect(
      within(callCard as HTMLElement).getByText("/v1/images/generations"),
    ).toBeInTheDocument();
    const textCurl = screen.getByText(
      /curl http:\/\/127\.0\.0\.1:8317\/v1\/images\/generations/,
    );
    expect(
      textCurl.compareDocumentPosition(screen.getByText("请求参数")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByText("请求参数")).toBeInTheDocument();
    expect(screen.getByText("返回结构")).toBeInTheDocument();
    const specCards = screen.getAllByTestId("image-generation-spec-card");
    expect(specCards).toHaveLength(2);
    for (const card of specCards) {
      expect(callCard).not.toContainElement(card);
      expect(card.className).toContain("p-4");
      expect(card.className).not.toContain("shadow");
    }
    expect(
      within(callCard as HTMLElement).queryByText("请求参数"),
    ).not.toBeInTheDocument();
    expect(
      within(callCard as HTMLElement).queryByText("返回结构"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("data[].revised_prompt").className).toContain(
      "break-all",
    );
    expect(screen.queryByText(/已加载全部/)).not.toBeInTheDocument();
    expect(screen.getByText("size")).toBeInTheDocument();
    expect(screen.getByText("quality")).toBeInTheDocument();
    expect(screen.getByText("n")).toBeInTheDocument();
    expect(screen.getByText(/"size": "1024x1024"/)).toBeInTheDocument();
    expect(screen.getByText(/"quality": "high"/)).toBeInTheDocument();
    expect(screen.queryByText("BaseURL")).not.toBeInTheDocument();
    expect(
      screen.getByText(/Authorization: Bearer YOUR_API_KEY/),
    ).toBeInTheDocument();
    expect(
      within(callCard as HTMLElement).getByRole("button", { name: "测试生成" }),
    ).toBeEnabled();
    expect(
      screen.queryByText(
        "查看 gpt-image-2 的调用方式、当前使用渠道，并直接发起测试生成。",
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("测试调用会自动轮询当前可用渠道。"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("设计号 A")).not.toBeInTheDocument();
    expect(screen.queryByText("设计号 B")).not.toBeInTheDocument();
    expect(screen.queryByText("Gemini 账号")).not.toBeInTheDocument();
  });

  test("opens the redesigned modal without mode tabs and uses options plus a round send button", async () => {
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
    expect(
      within(dialog).getByTestId("image-generation-stage"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByTestId("image-generation-composer"),
    ).toBeInTheDocument();
    expect(within(dialog).queryByText("准备创建图片")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("正在生成图片")).not.toBeInTheDocument();
    expect(
      within(dialog).getByText("输入提示词后开始生成图片"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("textbox", { name: "提示词" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByRole("tab", { name: "文生图" }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole("tab", { name: "图生图" }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).getByRole("combobox", { name: "分辨率" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("combobox", { name: "质量" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("combobox", { name: "生成数量" }),
    ).toBeInTheDocument();
    expect(within(dialog).queryByLabelText("上传图片")).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "发送" })).toBeVisible();
    expect(
      within(dialog).queryByTestId("image-generation-upload-trigger"),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).getByTestId("image-generation-send-button"),
    ).toHaveClass("right-2", "bottom-2", "h-7", "w-7");
    expect(within(dialog).getByRole("textbox", { name: "提示词" })).toHaveClass(
      "pb-10",
    );
    expect(within(dialog).getByTestId("image-generation-stage")).toHaveClass(
      "bg-slate-50",
      "h-[clamp(240px,42vh,400px)]",
    );
    expect(
      dialog.querySelector(".image-generation-dots-layer"),
    ).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole("combobox", { name: "分辨率" }));
    expect(
      await screen.findByRole("option", { name: "2560x1440" }),
    ).toBeVisible();
    expect(
      await screen.findByRole("option", { name: "2160x3840" }),
    ).toBeVisible();
    await user.click(await screen.findByRole("option", { name: "2160x3840" }));
    await user.click(within(dialog).getByRole("combobox", { name: "质量" }));
    await user.click(await screen.findByRole("option", { name: "high" }));
    await user.click(
      within(dialog).getByRole("combobox", { name: "生成数量" }),
    );
    await user.click(await screen.findByRole("option", { name: "2 张" }));

    await user.type(
      within(dialog).getByPlaceholderText(/输入提示词/i),
      "画一只狐狸",
    );
    vi.useFakeTimers();
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "发送" }));
    });

    expect(imageGenerationTestMock()).toHaveBeenCalledWith({
      mode: "generations",
      model: "gpt-image-2",
      prompt: "画一只狐狸",
      quality: "high",
      size: "2160x3840",
      n: 2,
    });

    expect(within(dialog).getByText("正在打草稿")).toBeInTheDocument();
    expect(within(dialog).getByText("00:00")).toBeInTheDocument();
    expect(within(dialog).getByTestId("image-generation-stage")).toHaveClass(
      "bg-slate-50",
    );
    expect(
      dialog.querySelectorAll(".image-generation-dots-layer"),
    ).toHaveLength(1);
    expect(
      dialog.querySelectorAll(".image-generation-flow-layer"),
    ).toHaveLength(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(within(dialog).getByText("00:01")).toBeInTheDocument();

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
    vi.useRealTimers();

    const image = await within(dialog).findByRole("img", {
      name: /gpt-image-2 预览/i,
    });
    expect(image).toHaveAttribute("src", "data:image/png;base64,aGVsbG8=");
    expect(
      within(dialog).getByTestId("image-generation-counter"),
    ).toHaveTextContent("1/2");
    expect(within(dialog).getByText("00:10")).toBeInTheDocument();
    expect(
      within(dialog).getByTestId("image-generation-carousel-track"),
    ).toHaveStyle({ transform: "translateX(0%)" });
    expect(
      within(dialog).getByRole("button", { name: "上一张" }),
    ).toBeDisabled();
    await user.click(within(dialog).getByRole("button", { name: "下一张" }));
    const activeImageAfterNext = within(dialog).getByRole("img", {
      name: /gpt-image-2 预览/i,
    });
    expect(activeImageAfterNext).toHaveAttribute(
      "src",
      "data:image/png;base64,d29ybGQ=",
    );
    expect(
      within(dialog).getByTestId("image-generation-counter"),
    ).toHaveTextContent("2/2");
    expect(
      within(dialog).getByTestId("image-generation-carousel-track"),
    ).toHaveStyle({ transform: "translateX(-100%)" });
    expect(
      within(dialog).getByTestId("image-generation-result-scroll"),
    ).toHaveClass("overflow-auto");
    expect(image).toHaveClass("w-full");
    expect(within(dialog).getByText("第二张")).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "点击预览" }),
    ).toBeVisible();

    await user.click(image);
    const preview = await screen.findByRole("dialog", { name: "图片预览" });
    expect(preview).toHaveAttribute("data-variant", "image-only");
    expect(preview).not.toHaveClass("max-w-[860px]");
    expect(
      within(preview).getByRole("img", { name: /gpt-image-2 预览/i }),
    ).toHaveClass("max-w-none");
  });

  test("hides image edit upload controls while edits are temporarily disabled", async () => {
    const user = userEvent.setup();

    renderPage();

    await screen.findByRole("tab", { name: "gpt-image-2" });
    await user.click(screen.getByRole("button", { name: "测试生成" }));

    const dialog = await screen.findByRole("dialog", { name: "测试生成" });
    expect(within(dialog).queryByLabelText("上传图片")).not.toBeInTheDocument();
    expect(
      within(dialog).queryByTestId("image-generation-upload-trigger"),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).queryByTestId("image-generation-upload-strip"),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).getByRole("textbox", { name: "提示词" }),
    ).not.toHaveClass("pt-12");
  });

  test("greys the preview area and shows the error message inside the modal when generation fails", async () => {
    const deferred = createDeferred<never>();
    imageGenerationTestMock().mockReturnValue(deferred.promise);

    renderPage();

    await screen.findByRole("tab", { name: "gpt-image-2" });
    await userEvent.click(screen.getByRole("button", { name: "测试生成" }));

    const dialog = await screen.findByRole("dialog", { name: "测试生成" });
    await userEvent.type(
      within(dialog).getByPlaceholderText(/输入提示词/i),
      "画一只狐狸",
    );
    vi.useFakeTimers();
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "发送" }));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(within(dialog).getByText("00:02")).toBeInTheDocument();

    await act(async () => {
      deferred.reject(new Error("上游图片生成失败"));
    });
    vi.useRealTimers();

    expect(
      await within(dialog).findByText("上游图片生成失败"),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("00:02")).toBeInTheDocument();
    expect(within(dialog).getByTestId("image-generation-preview")).toHaveClass(
      "bg-slate-100",
    );
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

    expect(
      await screen.findByText("当前没有可用于 gpt-image-2 的渠道。"),
    ).toBeInTheDocument();
    const callCard = screen.getByText("调用方式").closest("section");
    expect(
      within(callCard as HTMLElement).getByRole("button", { name: "测试生成" }),
    ).toBeDisabled();
    expect(screen.getByTestId("image-generation-disabled-state")).toHaveClass(
      "opacity-60",
    );
  });
});
