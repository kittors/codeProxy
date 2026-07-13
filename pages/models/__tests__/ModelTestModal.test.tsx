import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import i18n from "@code-proxy/i18n";
import { ThemeProvider } from "@code-proxy/ui";
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

describe("ModelTestModal", () => {
  test("renders success response in green and hides bare channels", async () => {
    await i18n.changeLanguage("en");
    const onRun = vi.fn();
    render(
      <ThemeProvider>
        <ModelTestModal
          model={baseModel}
          running={false}
          resultText="I'll check the weather."
          errorText={null}
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
          resultText={null}
          errorText="upstream timeout"
          onClose={() => undefined}
          onRun={() => undefined}
        />
      </ThemeProvider>,
    );

    const error = screen.getByTestId("model-test-error");
    expect(error).toHaveTextContent("upstream timeout");
    expect(error.querySelector("[role='alert']")?.className).toMatch(/rose/);
  });
});
