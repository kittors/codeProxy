import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@/i18n";
import { authFilesApi, imageGenerationApi } from "@/lib/http/apis";
import { ImageGenerationPage } from "@/modules/image-generation/ImageGenerationPage";
import { ThemeProvider } from "@/modules/ui/ThemeProvider";
import { ToastProvider } from "@/modules/ui/ToastProvider";

const authFilesListMock = () => vi.mocked(authFilesApi.list);
const imageGenerationTestMock = () => vi.mocked(imageGenerationApi.test);

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

  test("renders only the request example and test entry for gpt-image-2", async () => {
    renderPage();

    expect(await screen.findByRole("tab", { name: "gpt-image-2" })).toBeInTheDocument();
    expect(screen.getByText(/POST \/v1\/images\/generations/)).toBeInTheDocument();
    expect(screen.getByText(/Authorization: Bearer YOUR_API_KEY/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "测试生成" })).toBeEnabled();
    expect(
      screen.queryByText("查看 gpt-image-2 的调用方式、当前使用渠道，并直接发起测试生成。"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("设计号 A")).not.toBeInTheDocument();
    expect(screen.queryByText("设计号 B")).not.toBeInTheDocument();
    expect(screen.queryByText("Gemini 账号")).not.toBeInTheDocument();
  });

  test("opens a fixed-size modal and shows returned image after a successful test call", async () => {
    imageGenerationTestMock().mockResolvedValue({
      created: 1,
      data: [
        {
          b64_json: "aGVsbG8=",
          revised_prompt: "修订提示词",
        },
      ],
    });

    renderPage();

    await screen.findByRole("tab", { name: "gpt-image-2" });
    await userEvent.click(screen.getByRole("button", { name: "测试生成" }));

    const dialog = await screen.findByRole("dialog", { name: "测试生成" });
    expect(dialog.className).toContain("w-[92vw]");
    expect(dialog.className).toContain("h-[78vh]");

    await userEvent.type(within(dialog).getByPlaceholderText(/输入提示词/i), "画一只狐狸");
    await userEvent.click(within(dialog).getByRole("button", { name: /生成图片/i }));

    await waitFor(() => {
      expect(imageGenerationTestMock()).toHaveBeenCalledWith({
        model: "gpt-image-2",
        prompt: "画一只狐狸",
      });
    });

    expect(await within(dialog).findByRole("img", { name: /gpt-image-2 预览/i })).toHaveAttribute(
      "src",
      "data:image/png;base64,aGVsbG8=",
    );
    expect(within(dialog).getByText("修订提示词")).toBeInTheDocument();
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
    expect(screen.getByRole("button", { name: "测试生成" })).toBeDisabled();
    expect(screen.getByTestId("image-generation-disabled-state")).toHaveClass("opacity-60");
  });
});
