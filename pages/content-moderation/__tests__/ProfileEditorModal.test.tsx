import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { ContentModerationProfileView } from "@code-proxy/api-client";
import i18n from "@code-proxy/i18n";
import { ProfileEditorModal, type ProfileEditorModalProps } from "../components/ProfileEditorModal";

const profile: ContentModerationProfileView = {
  id: "profile-1",
  name: "Strict prompts",
  mode: "pre_block",
  base_url: "https://api.openai.com",
  model: "omni-moderation-latest",
  timeout_ms: 3000,
  keyword_mode: "keyword_only",
  blocked_keywords: ["blocked"],
  thresholds: { violence: 0.95 },
  block_http_status: 403,
  block_message: "Blocked",
  version: 3,
  created_at: "2026-07-22T01:00:00Z",
  updated_at: "2026-07-22T02:00:00Z",
  api_key_configured: true,
  api_key_masked: "sk-a****z",
  binding_counts: { auth_file: 2, provider_key: 1, provider: 1 },
};

function renderEditor({
  editedProfile = null,
  onSave = vi.fn<ProfileEditorModalProps["onSave"]>().mockResolvedValue(undefined),
}: {
  editedProfile?: ContentModerationProfileView | null;
  onSave?: ProfileEditorModalProps["onSave"];
} = {}) {
  render(
    <ProfileEditorModal
      open
      profile={editedProfile}
      saving={false}
      onClose={() => undefined}
      onSave={onSave}
    />,
  );
}

describe("ProfileEditorModal", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  test("uses shared FormField wiring and full-width Select controls", () => {
    renderEditor();

    const form = document.querySelector("form[data-slot='form']");
    expect(form).toHaveAttribute("id", "content-moderation-profile-form");
    expect(document.querySelectorAll("[data-slot='form-field']")).toHaveLength(11);
    expect(document.querySelector("[data-slot='form-field-info'].invisible")).toBeNull();

    expect(screen.getByRole("combobox", { name: "Mode" })).toHaveClass("w-full");
    expect(screen.getByRole("combobox", { name: "Check strategy" })).toHaveClass("w-full");

    const keywords = screen.getByLabelText("Blocked keywords");
    const keywordsHint = screen.getByText(
      "Matches are case-insensitive substrings. Empty lines and duplicates are removed.",
    );
    expect(keywords).toHaveAttribute("aria-describedby", keywordsHint.id);

    const thresholds = screen.getByLabelText("Category thresholds");
    const thresholdsHint = screen.getByText(
      "One category=value entry per line. Values must be between 0 and 1.",
    );
    expect(thresholds).toHaveAttribute("aria-describedby", thresholdsHint.id);
  });

  test("keeps moderation API fields disabled in keyword-only mode", () => {
    renderEditor({ editedProfile: profile });

    expect(screen.getByLabelText("Moderation base URL")).toBeDisabled();
    expect(screen.getByLabelText("Moderation model")).toBeDisabled();
    expect(screen.getByLabelText("Moderation API key")).toBeDisabled();
    expect(screen.getByLabelText("Category thresholds")).toBeDisabled();
    expect(screen.getByRole("switch", { name: "Clear the configured API key" })).not.toBeDisabled();
  });

  test("submits the existing create payload through the form", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn<ProfileEditorModalProps["onSave"]>().mockResolvedValue(undefined);
    renderEditor({ onSave });

    fireEvent.change(screen.getByRole("textbox", { name: "Profile name" }), {
      target: { value: "  New Profile  " },
    });
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "New Profile",
        mode: "off",
        base_url: "https://api.openai.com",
        model: "omni-moderation-latest",
        timeout_ms: 3000,
        keyword_mode: "api_only",
        blocked_keywords: [],
        block_http_status: 403,
        block_message: "Your request was blocked by the content moderation policy.",
      }),
    );
    expect(onSave.mock.calls[0]?.[0]).not.toHaveProperty("version");
    expect(onSave.mock.calls[0]?.[0]).not.toHaveProperty("clear_api_key");
  });
});
