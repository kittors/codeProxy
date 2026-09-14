import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import i18n from "@code-proxy/i18n";
import { ThemeProvider } from "@code-proxy/ui";
import type { CodexImageGenerationBridgeEditorState } from "@code-proxy/domain";
import { CodexImageGenerationBridgePanel } from "../components/CodexImageGenerationBridgePanel";

const baseEditor: CodexImageGenerationBridgeEditorState = {
  fileName: "codex.json",
  supported: true,
  enabled: true,
  model: "",
  availableModels: [
    { id: "gpt-image-2" },
    { id: "gpt-image-2.5-flare", display_name: "GPT Image 2.5 Flare" },
    { id: "gpt-image-2.5-sunburst", display_name: "GPT Image 2.5 Sunburst" },
  ],
  saving: false,
  error: null,
};

function renderPanel(editor: Partial<CodexImageGenerationBridgeEditorState> = {}) {
  const setEditor = vi.fn();
  render(
    <ThemeProvider>
      <CodexImageGenerationBridgePanel editor={{ ...baseEditor, ...editor }} setEditor={setEditor} />
    </ThemeProvider>,
  );
  return { setEditor };
}

describe("CodexImageGenerationBridgePanel", () => {
  test("offers every image model the server reported, plus the build default", async () => {
    await i18n.changeLanguage("en");
    renderPanel();

    const select = screen.getByLabelText(/image model for the injected tool/i);
    await userEvent.click(select);

    await waitFor(() => {
      expect(screen.getByRole("option", { name: /build default/i })).toBeInTheDocument();
    });
    // Matched as whole option labels: "gpt-image-2" is a substring of the 2.5
    // ids, so a substring match would pass even if the plain model were missing.
    const labels = screen.getAllByRole("option").map((option) => option.textContent?.trim());
    expect(labels).toEqual([
      "Build default",
      "gpt-image-2",
      "GPT Image 2.5 Flare · gpt-image-2.5-flare",
      "GPT Image 2.5 Sunburst · gpt-image-2.5-sunburst",
    ]);
  });

  test("picking a model stages it on the editor", async () => {
    await i18n.changeLanguage("en");
    const { setEditor } = renderPanel();

    await userEvent.click(screen.getByLabelText(/image model for the injected tool/i));
    await userEvent.click(await screen.findByRole("option", { name: /gpt-image-2\.5-flare/ }));

    expect(setEditor).toHaveBeenCalled();
    const update = setEditor.mock.calls.at(-1)?.[0] as (
      prev: CodexImageGenerationBridgeEditorState,
    ) => CodexImageGenerationBridgeEditorState;
    expect(update(baseEditor).model).toBe("gpt-image-2.5-flare");
  });

  // The tool is not injected at all while the bridge is off, so a model pinned
  // in that state would be a setting with no effect.
  test("the model selector is disabled while the bridge is off", async () => {
    await i18n.changeLanguage("en");
    renderPanel({ enabled: false });
    const wrapper = screen.getByTestId("codex-image-generation-model-select");
    expect(within(wrapper).getByLabelText(/image model/i)).toBeDisabled();
  });

  test("renders nothing for an account the bridge does not support", async () => {
    await i18n.changeLanguage("en");
    renderPanel({ supported: false });
    expect(screen.queryByTestId("codex-image-generation-bridge-panel")).not.toBeInTheDocument();
  });

  // A deployment whose catalog reports no Codex image model must not show an
  // empty dropdown that can only be set back to the default.
  test("hides the selector when no models were reported", async () => {
    await i18n.changeLanguage("en");
    renderPanel({ availableModels: [] });
    expect(screen.queryByTestId("codex-image-generation-model-select")).not.toBeInTheDocument();
    expect(screen.getByTestId("codex-image-generation-bridge-toggle")).toBeInTheDocument();
  });
});
