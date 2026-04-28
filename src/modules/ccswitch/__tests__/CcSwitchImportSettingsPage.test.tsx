import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test } from "vitest";
import i18n from "@/i18n";
import { CcSwitchImportSettingsPage } from "@/modules/ccswitch/CcSwitchImportSettingsPage";
import { ThemeProvider } from "@/modules/ui/ThemeProvider";
import { ToastProvider } from "@/modules/ui/ToastProvider";

function renderPage() {
  return render(
    <ThemeProvider>
      <ToastProvider>
        <CcSwitchImportSettingsPage />
      </ToastProvider>
    </ThemeProvider>,
  );
}

describe("CcSwitchImportSettingsPage", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    window.localStorage.clear();
  });

  test("persists editable Codex endpoint path and default model settings", async () => {
    renderPage();

    const endpointPath = screen.getByLabelText(/codex endpoint path/i);
    const defaultModel = screen.getByLabelText(/codex default model/i);

    expect(endpointPath).toHaveValue("/v1");
    expect(defaultModel).toHaveValue("gpt-5.5");

    await userEvent.clear(endpointPath);
    await userEvent.type(endpointPath, "/openai/v1");
    await userEvent.clear(defaultModel);
    await userEvent.type(defaultModel, "gpt-5.6");
    await userEvent.click(screen.getByRole("button", { name: /save cc switch settings/i }));

    await waitFor(() => {
      const raw = window.localStorage.getItem("ccswitch.importSettings.v1");
      expect(raw).toBeTruthy();
      expect(JSON.parse(raw!)).toMatchObject({
        codex: {
          endpointPath: "/openai/v1",
          defaultModel: "gpt-5.6",
        },
      });
    });
  });
});
