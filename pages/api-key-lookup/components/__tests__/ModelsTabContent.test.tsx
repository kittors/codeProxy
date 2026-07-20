import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import i18n from "@code-proxy/i18n";
import { emptyModelPricing } from "@features/model-availability";
import { ModelsTabContent } from "../ModelsTabContent";
import { ThemeProvider } from "@code-proxy/ui";
import { ToastProvider } from "@code-proxy/ui";
import type { PublicModelItem } from "../../api";

const model = (id: string, extras?: Partial<PublicModelItem>): PublicModelItem => ({
  id,
  description: extras?.description ?? "",
  ownedBy: extras?.ownedBy ?? "",
  pricing: extras?.pricing ?? emptyModelPricing(),
  inputModalities: extras?.inputModalities ?? ["text"],
  outputModalities: extras?.outputModalities ?? ["text"],
  supportsVision: extras?.supportsVision ?? false,
});

describe("ModelsTabContent", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("filters available models by vendor tabs and shows plaza-style cards with pricing", async () => {
    await i18n.changeLanguage("en");

    render(
      <ThemeProvider>
        <ToastProvider>
          <ModelsTabContent
            models={[
              model("gpt-5.4", {
                description: "OpenAI flagship",
                ownedBy: "openai",
                pricing: {
                  ...emptyModelPricing(),
                  inputPricePerMillion: 2.5,
                  outputPricePerMillion: 10,
                  cacheReadPricePerMillion: 0.25,
                },
              }),
              model("qwen3.5-plus", { description: "Qwen plus", ownedBy: "qwen" }),
              model("deepseek-chat", { description: "DeepSeek chat", ownedBy: "deepseek" }),
            ]}
            loading={false}
            error={null}
            searchFilter=""
            onSearchChange={() => {}}
          />
        </ToastProvider>
      </ThemeProvider>,
    );

    expect(screen.getByText("Model Plaza")).toBeInTheDocument();
    expect(screen.getByTestId("apikey-lookup-model-grid")).toBeInTheDocument();
    expect(screen.getByText("gpt-5.4")).toBeInTheDocument();
    expect(screen.getByText("OpenAI flagship")).toBeInTheDocument();
    expect(screen.getByText("$2.5")).toBeInTheDocument();
    expect(screen.getByText("$10")).toBeInTheDocument();
    expect(screen.getByText("$0.25")).toBeInTheDocument();
    expect(screen.getByText("qwen3.5-plus")).toBeInTheDocument();
    expect(screen.getByText("deepseek-chat")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/search models/i)).toBeInTheDocument();
    const sticky = screen.getByTestId("apikey-lookup-model-tabs-sticky");
    expect(sticky).toHaveClass("sticky", "top-20", "z-10");
    expect(within(sticky).getByRole("tablist", { name: /filter by vendor/i })).toBeInTheDocument();
    expect(within(sticky).getByPlaceholderText(/search models/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: /qwen/i }));

    expect(screen.getByText("qwen3.5-plus")).toBeInTheDocument();
    expect(screen.queryByText("gpt-5.4")).not.toBeInTheDocument();
    expect(screen.queryByText("deepseek-chat")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: /all/i }));

    expect(screen.getByText("gpt-5.4")).toBeInTheDocument();
    expect(screen.getByText("qwen3.5-plus")).toBeInTheDocument();
    expect(screen.getByText("deepseek-chat")).toBeInTheDocument();
  });

  test("keeps the two-line clamp separate from the flexible description spacer", async () => {
    await i18n.changeLanguage("en");

    render(
      <ThemeProvider>
        <ToastProvider>
          <ModelsTabContent
            models={[
              model("gpt-5", {
                description:
                  "A long model description that must be clamped to exactly two complete lines without painting a partially clipped third line below the ellipsis.",
                ownedBy: "openai",
              }),
            ]}
            loading={false}
            error={null}
            searchFilter=""
            onSearchChange={() => {}}
          />
        </ToastProvider>
      </ThemeProvider>,
    );

    const clamp = screen.getByTestId("model-description-clamp");
    const spacer = screen.getByTestId("model-description-space");

    expect(clamp).toHaveClass("line-clamp-2");
    expect(clamp).not.toHaveClass("flex-1", "min-h-10");
    expect(spacer).toHaveClass("flex-1", "min-h-10");
    expect(spacer).toContainElement(clamp);
  });

  test("does not render the CC Switch import action inside available models", async () => {
    await i18n.changeLanguage("en");

    render(
      <ThemeProvider>
        <ToastProvider>
          <ModelsTabContent
            models={[model("claude-sonnet-4-5"), model("gpt-5.3-codex"), model("gemini-2.5-pro")]}
            loading={false}
            error={null}
            searchFilter=""
            onSearchChange={() => {}}
          />
        </ToastProvider>
      </ThemeProvider>,
    );

    expect(screen.queryByText(/import to cc switch/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /import codex/i })).not.toBeInTheDocument();
  });
});
