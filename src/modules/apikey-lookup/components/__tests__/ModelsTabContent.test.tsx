import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import i18n from "@/i18n";
import { ModelsTabContent } from "@/modules/apikey-lookup/components/ModelsTabContent";
import { ThemeProvider } from "@/modules/ui/ThemeProvider";
import { ToastProvider } from "@/modules/ui/ToastProvider";

describe("ModelsTabContent", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("renders CC Switch import cards and launches selected provider deeplink", async () => {
    await i18n.changeLanguage("en");
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);
    vi.spyOn(document, "hasFocus").mockReturnValue(false);

    render(
      <ThemeProvider>
        <ToastProvider>
          <ModelsTabContent
            models={["claude-sonnet-4-5", "gpt-5.3-codex", "gemini-2.5-pro"]}
            loading={false}
            error={null}
            searchFilter=""
            onSearchChange={() => {}}
            apiKey="sk-lookup-key"
          />
        </ToastProvider>
      </ThemeProvider>,
    );

    expect(screen.getByText(/import to cc switch/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /import codex/i }));

    await waitFor(() => {
      expect(openSpy).toHaveBeenCalledWith(
        expect.stringContaining("ccswitch://v1/import?"),
        "_self",
      );
    });

    const openedUrl = String(openSpy.mock.calls.at(-1)?.[0] ?? "");
    const parsed = new URL(openedUrl);
    expect(parsed.searchParams.get("app")).toBe("codex");
    expect(parsed.searchParams.get("model")).toBe("gpt-5.3-codex");
    expect(parsed.searchParams.get("apiKey")).toBe("sk-lookup-key");
  });
});
