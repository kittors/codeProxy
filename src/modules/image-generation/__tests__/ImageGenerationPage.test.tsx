import { render, screen, waitFor } from "@testing-library/react";
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

  test("renders the gpt-image-2 tab, current channel labels, and request example", async () => {
    render(
      <MemoryRouter>
        <ThemeProvider>
          <ToastProvider>
            <ImageGenerationPage />
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("tab", { name: "gpt-image-2" })).toBeInTheDocument();
    expect(screen.getByText("设计号 A")).toBeInTheDocument();
    expect(screen.getByText("设计号 B")).toBeInTheDocument();
    expect(screen.queryByText("Gemini 账号")).not.toBeInTheDocument();
    expect(screen.getByText(/POST \/v1\/images\/generations/)).toBeInTheDocument();
    expect(screen.getByText(/Authorization: Bearer YOUR_API_KEY/)).toBeInTheDocument();
  });

  test("shows returned image in place after a successful test call", async () => {
    imageGenerationTestMock().mockResolvedValue({
      created: 1,
      data: [
        {
          b64_json: "aGVsbG8=",
          revised_prompt: "修订提示词",
        },
      ],
    });

    render(
      <MemoryRouter>
        <ThemeProvider>
          <ToastProvider>
            <ImageGenerationPage />
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    await screen.findByText("设计号 A");
    await userEvent.type(screen.getByPlaceholderText(/输入提示词/i), "画一只狐狸");
    await userEvent.click(screen.getByRole("button", { name: /生成图片/i }));

    await waitFor(() => {
      expect(imageGenerationTestMock()).toHaveBeenCalledWith({
        model: "gpt-image-2",
        prompt: "画一只狐狸",
      });
    });

    expect(await screen.findByRole("img", { name: /gpt-image-2 预览/i })).toHaveAttribute(
      "src",
      "data:image/png;base64,aGVsbG8=",
    );
    expect(screen.getByText("修订提示词")).toBeInTheDocument();
  });

  test("greys the preview area and shows the error message when generation fails", async () => {
    imageGenerationTestMock().mockRejectedValue(new Error("上游图片生成失败"));

    render(
      <MemoryRouter>
        <ThemeProvider>
          <ToastProvider>
            <ImageGenerationPage />
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    await screen.findByText("设计号 A");
    await userEvent.type(screen.getByPlaceholderText(/输入提示词/i), "画一只狐狸");
    await userEvent.click(screen.getByRole("button", { name: /生成图片/i }));

    expect(await screen.findByText("上游图片生成失败")).toBeInTheDocument();
    expect(screen.getByTestId("image-generation-preview")).toHaveClass("bg-slate-100");
  });
});
