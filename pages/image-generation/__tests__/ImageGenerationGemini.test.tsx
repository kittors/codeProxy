import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@code-proxy/i18n";
import { imageGenerationApi } from "@code-proxy/api-client";
import { ThemeProvider, ToastProvider } from "@code-proxy/ui";
import { ImageGenerationPage } from "../ImageGenerationPage";

const GEMINI_RATIOS = [
  "1:1",
  "16:9",
  "9:16",
  "4:3",
  "3:4",
  "3:2",
  "2:3",
  "5:4",
  "4:5",
  "21:9",
  "4:1",
  "1:4",
  "8:1",
  "1:8",
];

const mocked = <K extends keyof typeof imageGenerationApi>(key: K) =>
  imageGenerationApi[key] as unknown as ReturnType<typeof vi.fn>;

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

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  renderPage();
  await screen.findByRole("tab", { name: "图片生成" });
  await waitFor(() => expect(screen.getByRole("button", { name: "测试生成" })).toBeEnabled());
  await user.click(screen.getByRole("button", { name: "测试生成" }));
  return screen.findByRole("dialog", { name: "测试生成" });
}

describe("ImageGenerationPage with a Gemini image model", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-CN");
    vi.spyOn(imageGenerationApi, "getChannels");
    vi.spyOn(imageGenerationApi, "getSizePresets");
    vi.spyOn(imageGenerationApi, "startTestTask");
    vi.spyOn(imageGenerationApi, "getTestTask");
    mocked("getChannels").mockResolvedValue({
      model: "gpt-image-2",
      channels: ["Design G"],
      providers: [
        { provider: "antigravity", channels: ["Design G"], models: ["gemini-3.1-flash-image"] },
      ],
      models: [
        {
          id: "gemini-3.1-flash-image",
          provider: "antigravity",
          display_name: "Gemini 3.1 Flash Image",
          supports_edit: true,
          aspect_ratios: GEMINI_RATIOS,
          image_sizes: ["512", "1K", "2K", "4K"],
        },
      ],
    });
    mocked("getSizePresets").mockResolvedValue({ sizes: ["1024x1024"] });
    mocked("startTestTask").mockResolvedValue({ task_id: "task-gemini", status: "queued" });
    mocked("getTestTask").mockResolvedValue({
      task_id: "task-gemini",
      status: "succeeded",
      phase: "completed",
      result: { created: 1, data: [{ b64_json: "AAAA" }], output_format: "jpeg", size: "1408x768" },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("offers ratio and size tier instead of size and quality, and sends them", async () => {
    const user = userEvent.setup();
    const dialog = await openDialog(user);

    const ratio = within(dialog).getByRole("combobox", { name: "比例" });
    const tier = within(dialog).getByRole("combobox", { name: "分辨率档位" });
    // Defaults match the gpt-image page: a square at the upstream's default tier.
    expect(ratio).toHaveTextContent("1:1");
    expect(tier).toHaveTextContent("1K");
    // The WIDTHxHEIGHT and quality pickers would promise output this model does not produce.
    expect(within(dialog).queryByRole("combobox", { name: "分辨率" })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("combobox", { name: "质量" })).not.toBeInTheDocument();

    await user.click(ratio);
    for (const value of GEMINI_RATIOS) {
      expect(await screen.findByRole("option", { name: value })).toBeInTheDocument();
    }
    await user.click(screen.getByRole("option", { name: "16:9" }));
    await user.click(tier);
    await user.click(await screen.findByRole("option", { name: "2K" }));

    await user.type(within(dialog).getByRole("textbox", { name: "提示词" }), "海边的红色灯塔");
    await user.click(within(dialog).getByRole("button", { name: "生成图片" }));

    await waitFor(() => {
      expect(mocked("startTestTask")).toHaveBeenCalledWith({
        mode: "generations",
        model: "gemini-3.1-flash-image",
        prompt: "海边的红色灯塔",
        n: 1,
        aspect_ratio: "16:9",
        image_size: "2K",
      });
    });

    // The server reported JPEG, so the preview must not be labelled as PNG.
    const image = await within(dialog).findByAltText(/gemini-3\.1-flash-image/);
    expect(image.getAttribute("src")).toBe("data:image/jpeg;base64,AAAA");
  });

  test("auto ratio leaves the shape to the model", async () => {
    const user = userEvent.setup();
    const dialog = await openDialog(user);

    await user.click(within(dialog).getByRole("combobox", { name: "比例" }));
    await user.click(await screen.findByRole("option", { name: "自动（由模型决定）" }));
    await user.type(within(dialog).getByRole("textbox", { name: "提示词" }), "一只猫");
    await user.click(within(dialog).getByRole("button", { name: "生成图片" }));

    await waitFor(() => expect(mocked("startTestTask")).toHaveBeenCalled());
    const payload = mocked("startTestTask").mock.calls[0][0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty("aspect_ratio");
    expect(payload).not.toHaveProperty("size");
    expect(payload).not.toHaveProperty("quality");
    expect(payload.image_size).toBe("1K");
  });

  test("names the Antigravity provider and drops the gpt-image-only copy", async () => {
    const user = userEvent.setup();
    const dialog = await openDialog(user);

    expect(within(dialog).getByRole("combobox", { name: "模型" })).toHaveTextContent(
      "Gemini 3.1 Flash Image",
    );
    // Copy that used to pin the page to gpt-image-2 and Codex.
    expect(screen.queryByText(/固定传 gpt-image-2/)).not.toBeInTheDocument();
    expect(screen.getByText(/Gemini 生图走 Antigravity/)).toBeInTheDocument();
  });
});
