import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import i18n from "@code-proxy/i18n";
import { ThemeProvider } from "@code-proxy/ui";
import type { ModelTestResult } from "@code-proxy/api-client";
import {
  buildChannelOptions,
  isBareProviderOnlySource,
  ModelTestModal,
} from "../components/ModelTestModal";
import type { ModelItem } from "../types";

const baseModel: ModelItem = {
  id: "grok-4.5",
  owned_by: "xai",
  description: "test",
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
  inputModalities: ["text"],
  outputModalities: ["text"],
  supportsVision: false,
  sources: [
    {
      label: "xai · GinofkFerraiuolo@hotmail.com",
      provider: "xai",
      channel: "GinofkFerraiuolo@hotmail.com",
      clientId: "xai-1",
    },
    {
      label: "xai · LatoriaqcDarr@hotmail.com",
      provider: "xai",
      channel: "LatoriaqcDarr@hotmail.com",
      clientId: "xai-2",
    },
    {
      // Incomplete auth: no email/label beyond provider name (the blank "xai" row).
      label: "xai",
      provider: "xai",
      clientId: "xai-orphan",
    },
    {
      label: "xai",
      provider: "xai",
      channel: "xai",
      clientId: "xai-orphan-2",
    },
  ],
};

describe("buildChannelOptions / isBareProviderOnlySource", () => {
  test("filters bare provider-only sources like orphan xai rows", () => {
    expect(
      isBareProviderOnlySource({ label: "xai", provider: "xai", clientId: "x" }),
    ).toBe(true);
    expect(
      isBareProviderOnlySource({
        label: "xai",
        provider: "xai",
        channel: "xai",
      }),
    ).toBe(true);
    expect(
      isBareProviderOnlySource({
        label: "xai · user@example.com",
        provider: "xai",
        channel: "user@example.com",
      }),
    ).toBe(false);
    expect(
      isBareProviderOnlySource({
        label: "openai · Primary OpenAI",
        provider: "openai",
        channel: "Primary OpenAI",
      }),
    ).toBe(false);

    const options = buildChannelOptions(baseModel);
    expect(options.map((o) => o.channel)).toEqual([
      "GinofkFerraiuolo@hotmail.com",
      "LatoriaqcDarr@hotmail.com",
    ]);
    expect(options.some((o) => o.label === "xai" || o.channel === "xai")).toBe(
      false,
    );
  });

  test("keeps bare provider source only when it is the sole option", () => {
    const options = buildChannelOptions({
      ...baseModel,
      sources: [
        { label: "xai", provider: "xai", channel: "xai", clientId: "orphan" },
      ],
    });
    expect(options).toEqual([
      { value: "xai", label: "xai", channel: "xai" },
    ]);
  });
});

const imageModel: ModelItem = {
  ...baseModel,
  id: "gpt-image-2.5-flare",
  owned_by: "openai",
  inputModalities: ["text"],
  outputModalities: ["image"],
  sources: [
    {
      label: "codex · jd7@privaterelay.appleid.com",
      provider: "codex",
      channel: "jd7@privaterelay.appleid.com",
      clientId: "codex-1",
    },
  ],
};

const textResult: ModelTestResult = {
  ok: true,
  mode: "text",
  content: "I'll check the weather.",
  result: { kind: "text", text: "I'll check the weather." },
};

describe("ModelTestModal", () => {
  test("renders success response in green and hides bare channels", async () => {
    await i18n.changeLanguage("en");
    const onRun = vi.fn();
    render(
      <ThemeProvider>
        <ModelTestModal
          model={baseModel}
          running={false}
          result={textResult}
          errorText={null}
          options={null}
          onClose={() => undefined}
          onRun={onRun}
        />
      </ThemeProvider>,
    );

    const success = screen.getByTestId("model-test-success");
    expect(success).toHaveTextContent("I'll check the weather.");
    expect(success.querySelector("pre")?.className).toMatch(/emerald/);

    // Open channel select and ensure bare "xai" is not listed.
    const channelTrigger = screen.getByLabelText(/channel/i);
    await userEvent.click(channelTrigger);
    await waitFor(() => {
      expect(screen.queryByRole("option", { name: /^xai$/i })).not.toBeInTheDocument();
    });
    expect(
      screen.getByRole("option", { name: /GinofkFerraiuolo@hotmail.com/i }),
    ).toBeInTheDocument();
  });

  test("renders error response in red", async () => {
    await i18n.changeLanguage("en");
    render(
      <ThemeProvider>
        <ModelTestModal
          model={baseModel}
          running={false}
          result={null}
          errorText="upstream timeout"
          options={null}
          onClose={() => undefined}
          onRun={() => undefined}
        />
      </ThemeProvider>,
    );

    const error = screen.getByTestId("model-test-error");
    expect(error).toHaveTextContent("upstream timeout");
    expect(error.querySelector("[role='alert']")?.className).toMatch(/rose/);
  });

  // The reported bug: opening the probe on an image model offered a chat box and
  // the "How is the weather in Los Angeles today?" prompt, and running it
  // reported the resulting prose as a pass.
  test("an image model opens on image generation, not on a chat prompt", async () => {
    await i18n.changeLanguage("en");
    const onRun = vi.fn();
    render(
      <ThemeProvider>
        <ModelTestModal
          model={imageModel}
          running={false}
          result={null}
          errorText={null}
          options={{
            model: imageModel.id,
            modes: [
              {
                mode: "image",
                default_prompt: "A red ceramic teapot on a white marble table",
                requires_image: false,
              },
              { mode: "image_edit", default_prompt: "Replace the background", requires_image: true },
            ],
            sizes: ["1024x1024", "1792x1024"],
            qualities: ["low", "medium", "high"],
            max_images: 5,
          }}
          onClose={() => undefined}
          onRun={onRun}
        />
      </ThemeProvider>,
    );

    const prompt = screen.getByLabelText(/prompt/i) as HTMLTextAreaElement;
    await waitFor(() => {
      expect(prompt.value).toBe("A red ceramic teapot on a white marble table");
    });
    expect(prompt.value).not.toMatch(/weather/i);

    // Both directions are offered, and the image-only options are present.
    const modes = screen.getByTestId("model-test-modes");
    expect(modes).toHaveTextContent(/text to image/i);
    expect(modes).toHaveTextContent(/image to image/i);
    expect(screen.getByLabelText(/^size$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^quality$/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /run text to image/i }));
    expect(onRun).toHaveBeenCalledWith(expect.objectContaining({ mode: "image" }));
  });

  test("renders returned images and the provenance the file claims", async () => {
    await i18n.changeLanguage("en");
    render(
      <ThemeProvider>
        <ModelTestModal
          model={imageModel}
          running={false}
          result={{
            ok: true,
            mode: "image",
            result: {
              kind: "image",
              images: [
                {
                  b64_json: "iVBORw0KGgo=",
                  format: "png",
                  width: 1024,
                  height: 1024,
                  bytes: 2097672,
                  c2pa: { present: true, generator: "gpt-image", generator_version: "2.0" },
                },
              ],
            },
            metadata: {
              mode: "image",
              requested_model: "gpt-image-2.5-flare",
              provenance_model: "gpt-image",
              provenance_version: "2.0",
              provenance_matches: false,
            },
          }}
          errorText={null}
          options={null}
          onClose={() => undefined}
          onRun={() => undefined}
        />
      </ThemeProvider>,
    );

    expect(screen.getByTestId("model-test-images").querySelector("img")).toBeInTheDocument();
    // A 2.5 request served by 2.0 must be called out rather than reported green.
    const warning = screen.getByTestId("model-test-provenance-warning");
    expect(warning).toHaveTextContent(/gpt-image 2\.0/);
    expect(warning).toHaveTextContent(/gpt-image-2\.5-flare/);
  });

  test("shows the upstream request and metadata panels", async () => {
    await i18n.changeLanguage("en");
    render(
      <ThemeProvider>
        <ModelTestModal
          model={imageModel}
          running={false}
          result={{
            ...textResult,
            request: { model: "gpt-image-2.5-flare", prompt: "a teapot", image: "[inline image/png, 1.2 MB]" },
            metadata: {
              mode: "image",
              requested_model: "gpt-image-2.5-flare",
              upstream_endpoint: "/v1/images/generations",
            },
          }}
          errorText={null}
          options={null}
          onClose={() => undefined}
          onRun={() => undefined}
        />
      </ThemeProvider>,
    );

    const request = screen.getByTestId("model-test-request");
    await userEvent.click(request.querySelector("button") as HTMLButtonElement);
    // The upload is described by size rather than echoed back as base64.
    expect(request).toHaveTextContent("[inline image/png, 1.2 MB]");

    const metadata = screen.getByTestId("model-test-metadata");
    await userEvent.click(metadata.querySelector("button") as HTMLButtonElement);
    expect(metadata).toHaveTextContent("/v1/images/generations");
  });
});
