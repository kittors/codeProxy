import { render, screen, waitFor, within } from "@testing-library/react";
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

  test("renders the request example and places the test action in the call card header", async () => {
    renderPage();

    expect(await screen.findByRole("tab", { name: "gpt-image-2" })).toBeInTheDocument();
    const callCard = screen.getByText("调用方式").closest("section");
    expect(callCard).not.toBeNull();
    expect(screen.getByText(/POST \/v1\/images\/generations/)).toBeInTheDocument();
    expect(screen.getByText(/Authorization: Bearer YOUR_API_KEY/)).toBeInTheDocument();
    expect(within(callCard as HTMLElement).getByRole("button", { name: "测试生成" })).toBeEnabled();
    expect(
      screen.queryByText("查看 gpt-image-2 的调用方式、当前使用渠道，并直接发起测试生成。"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("测试调用会自动轮询当前可用渠道。")).not.toBeInTheDocument();
    expect(screen.queryByText("设计号 A")).not.toBeInTheDocument();
    expect(screen.queryByText("设计号 B")).not.toBeInTheDocument();
    expect(screen.queryByText("Gemini 账号")).not.toBeInTheDocument();
  });

  test("opens the redesigned modal, rotates loading copy, and previews the returned image", async () => {
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
    expect(within(dialog).getByRole("button", { name: "生成图片" })).toBeVisible();
    expect(within(dialog).getByTestId("image-generation-stage")).toHaveClass("bg-slate-50");
    expect(dialog.querySelector(".image-generation-dots-layer")).not.toBeInTheDocument();

    await user.type(within(dialog).getByPlaceholderText(/输入提示词/i), "画一只狐狸");
    await user.click(within(dialog).getByRole("button", { name: /生成图片/i }));

    await waitFor(() => {
      expect(imageGenerationTestMock()).toHaveBeenCalledWith({
        model: "gpt-image-2",
        prompt: "画一只狐狸",
      });
    });

    expect(within(dialog).getByText("正在生成图片")).toBeInTheDocument();
    expect(within(dialog).getByTestId("image-generation-stage")).toHaveClass("bg-slate-50");
    expect(dialog.querySelectorAll(".image-generation-dots-layer")).toHaveLength(2);

    await waitFor(() => {
      expect(within(dialog).getByText("正在打草稿")).toBeInTheDocument();
    }, { timeout: 2400 });

    deferred.resolve({
      created: 1,
      data: [
        {
          b64_json: "aGVsbG8=",
          revised_prompt: "修订提示词",
        },
      ],
    });

    const image = await within(dialog).findByRole("img", { name: /gpt-image-2 预览/i });
    expect(image).toHaveAttribute(
      "src",
      "data:image/png;base64,aGVsbG8=",
    );
    expect(image.parentElement?.tagName).not.toBe("BUTTON");
    expect(within(dialog).getByText("修订提示词")).toBeInTheDocument();

    await user.click(image);
    expect(await screen.findByRole("dialog", { name: "图片预览" })).toBeInTheDocument();
  });

  test("greys the preview area and shows the error message inside the modal when generation fails", async () => {
    imageGenerationTestMock().mockRejectedValue(new Error("上游图片生成失败"));

    renderPage();

    await screen.findByRole("tab", { name: "gpt-image-2" });
    await userEvent.click(screen.getByRole("button", { name: "测试生成" }));

    const dialog = await screen.findByRole("dialog", { name: "测试生成" });
    await userEvent.type(within(dialog).getByPlaceholderText(/输入提示词/i), "画一只狐狸");
    await userEvent.click(within(dialog).getByRole("button", { name: /生成图片/i }));

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
