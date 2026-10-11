import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import i18n from "@code-proxy/i18n";
import { ThemeProvider } from "@code-proxy/ui";
import { modelTestApi, type ModelTestOptions } from "@code-proxy/api-client";
import { ModelTestModal } from "../components/ModelTestModal";
import { useModelTestRunner } from "../hooks/useModelTestRunner";
import type { ModelItem } from "../types";

const geminiImageModel: ModelItem = {
  id: "gemini-3.1-flash-image",
  owned_by: "antigravity",
  description: "Gemini 3.1 Flash Image",
  enabled: true,
  source: "oauth",
  pricing: {
    mode: "token",
    inputPricePerMillion: 0,
    outputPricePerMillion: 0,
    cachedPricePerMillion: 0,
    cacheReadPricePerMillion: 0,
    cacheWritePricePerMillion: 0,
    pricePerCall: 0,
  },
  inputModalities: ["text", "image"],
  outputModalities: ["text", "image"],
  supportsVision: true,
  sources: [
    {
      label: "antigravity · design@example.com",
      provider: "antigravity",
      channel: "design@example.com",
      clientId: "antigravity-1",
    },
  ],
};

const geminiOptions: ModelTestOptions = {
  model: geminiImageModel.id,
  modes: [
    { mode: "image", default_prompt: "A red ceramic teapot", requires_image: false },
    { mode: "image_edit", default_prompt: "Replace the background", requires_image: true },
  ],
  aspect_ratios: [
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
  ],
  image_sizes: ["512", "1K", "2K", "4K"],
  max_images: 5,
};

describe("model probe for a Gemini image model", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("offers ratio and size tier instead of size and quality", async () => {
    await i18n.changeLanguage("en");
    const onRun = vi.fn();
    render(
      <ThemeProvider>
        <ModelTestModal
          model={geminiImageModel}
          running={false}
          result={null}
          errorText={null}
          options={geminiOptions}
          onClose={() => undefined}
          onRun={onRun}
        />
      </ThemeProvider>,
    );

    const ratio = await screen.findByLabelText(/^aspect ratio$/i);
    const tier = screen.getByLabelText(/^size tier$/i);
    await waitFor(() => expect(ratio).toHaveTextContent("1:1"));
    expect(tier).toHaveTextContent("1K");
    expect(screen.queryByLabelText(/^size$/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^quality$/i)).not.toBeInTheDocument();

    await userEvent.click(ratio);
    await userEvent.click(await screen.findByRole("option", { name: "21:9" }));
    await userEvent.click(tier);
    await userEvent.click(await screen.findByRole("option", { name: "4K" }));
    await userEvent.click(screen.getByRole("button", { name: /run text to image/i }));

    expect(onRun).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "image", aspectRatio: "21:9", imageSize: "4K" }),
    );
  });

  test("the runner sends ratio and tier, and drops an auto ratio", async () => {
    vi.spyOn(modelTestApi, "getOptions").mockResolvedValue(geminiOptions);
    const runSpy = vi
      .spyOn(modelTestApi, "run")
      .mockResolvedValue({ ok: true, mode: "image", result: { kind: "image", images: [] } });
    const { result } = renderHook(() => useModelTestRunner());

    act(() => result.current.open(geminiImageModel));
    await act(async () => {
      await result.current.run({
        channel: "design@example.com",
        prompt: "a lighthouse",
        mode: "image",
        aspectRatio: "16:9",
        imageSize: "2K",
        n: 1,
      });
    });
    expect(runSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        model: geminiImageModel.id,
        aspect_ratio: "16:9",
        image_size: "2K",
      }),
    );

    await act(async () => {
      await result.current.run({
        channel: "design@example.com",
        prompt: "a lighthouse",
        mode: "image",
        aspectRatio: "auto",
        imageSize: "1K",
        n: 1,
      });
    });
    const sent = runSpy.mock.lastCall?.[0] as unknown as Record<string, unknown>;
    expect(sent).not.toHaveProperty("aspect_ratio");
    expect(sent.image_size).toBe("1K");
    expect(sent).not.toHaveProperty("size");
    expect(sent).not.toHaveProperty("quality");
  });
});
