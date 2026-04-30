import type { TFunction } from "i18next";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { CcSwitchImportOptions } from "@/modules/ccswitch/CcSwitchImportOptions";

const t = ((key: string, options?: Record<string, unknown>) => {
  const labels: Record<string, string> = {
    "ccswitch.import_to_ccswitch": "Import to CC Switch",
    "ccswitch.import_client": `Import ${String(options?.client ?? "")}`,
    "ccswitch.client_claude_code": "Claude Code",
    "ccswitch.client_claude_code_desc": "Claude Code config",
    "ccswitch.client_codex": "Codex",
    "ccswitch.client_codex_desc": "Codex config",
    "ccswitch.client_gemini_cli": "Gemini CLI",
    "ccswitch.client_gemini_cli_desc": "Gemini CLI config",
    "ccswitch.model_hint": `Model: ${String(options?.model ?? "")}`,
    "ccswitch.settings_auth_field": `${String(options?.client ?? "")} auth field`,
    "ccswitch.auth_field_anthropic_api_key": "ANTHROPIC_API_KEY",
    "ccswitch.auth_field_anthropic_auth_token": "ANTHROPIC_AUTH_TOKEN",
  };
  return labels[key] ?? key;
}) as TFunction;

const expectIconToContainTitle = (testId: string, title: string) => {
  const src = screen.getByTestId(testId).getAttribute("src") ?? "";
  expect(decodeURIComponent(src)).toContain(`<title>${title}</title>`);
};

describe("CcSwitchImportOptions", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test("uses provider brand icons for all import choices", () => {
    render(
      <CcSwitchImportOptions
        t={t}
        models={["claude-sonnet-4-20250514", "gpt-5.3-codex", "gemini-2.5-pro"]}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Import Claude Code" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import Codex" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import Gemini CLI" })).toBeInTheDocument();
    expectIconToContainTitle("ccswitch-client-icon-claude", "Claude");
    expectIconToContainTitle("ccswitch-client-icon-codex", "Codex");
    expectIconToContainTitle("ccswitch-client-icon-gemini", "Gemini");
  });

  test("lets the import menu update the Claude auth field setting", async () => {
    render(<CcSwitchImportOptions t={t} models={[]} onSelect={vi.fn()} />);

    const user = userEvent.setup();
    const authField = screen.getByRole("combobox", { name: "Claude Code auth field" });

    expect(authField).toHaveTextContent("ANTHROPIC_API_KEY");

    await user.click(authField);
    await user.click(screen.getByRole("option", { name: "ANTHROPIC_AUTH_TOKEN" }));

    const raw = window.localStorage.getItem("ccswitch.importSettings.v1");
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!)).toMatchObject({
      claude: {
        apiKeyField: "ANTHROPIC_AUTH_TOKEN",
      },
    });
  });
});
