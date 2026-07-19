import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import i18n from "@code-proxy/i18n";
import { ModelsTabContent } from "../ModelsTabContent";
import { ThemeProvider } from "@code-proxy/ui";
import { ToastProvider } from "@code-proxy/ui";

describe("ModelsTabContent", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("filters available models by vendor tabs and shows plaza-style cards", async () => {
    await i18n.changeLanguage("en");

    render(
      <ThemeProvider>
        <ToastProvider>
          <ModelsTabContent
            models={["gpt-5.4", "qwen3.5-plus", "deepseek-chat"]}
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
    expect(screen.getByText("qwen3.5-plus")).toBeInTheDocument();
    expect(screen.getByText("deepseek-chat")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/search models/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: /qwen/i }));

    expect(screen.getByText("qwen3.5-plus")).toBeInTheDocument();
    expect(screen.queryByText("gpt-5.4")).not.toBeInTheDocument();
    expect(screen.queryByText("deepseek-chat")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: /all/i }));

    expect(screen.getByText("gpt-5.4")).toBeInTheDocument();
    expect(screen.getByText("qwen3.5-plus")).toBeInTheDocument();
    expect(screen.getByText("deepseek-chat")).toBeInTheDocument();
  });

  test("does not render the CC Switch import action inside available models", async () => {
    await i18n.changeLanguage("en");

    render(
      <ThemeProvider>
        <ToastProvider>
          <ModelsTabContent
            models={["claude-sonnet-4-5", "gpt-5.3-codex", "gemini-2.5-pro"]}
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
