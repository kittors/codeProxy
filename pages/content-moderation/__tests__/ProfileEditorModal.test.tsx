import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { ContentModerationProfileView } from "@code-proxy/api-client";
import i18n from "@code-proxy/i18n";
import { ProfileEditorModal, type ProfileEditorModalProps } from "../components/ProfileEditorModal";

const DEFAULT_THRESHOLDS = {
  harassment: 0.98,
  "harassment/threatening": 0.9,
  hate: 0.65,
  "hate/threatening": 0.65,
  illicit: 0.95,
  "illicit/violent": 0.95,
  "self-harm": 0.65,
  "self-harm/intent": 0.85,
  "self-harm/instructions": 0.65,
  sexual: 0.65,
  "sexual/minors": 0.65,
  violence: 0.95,
  "violence/graphic": 0.95,
};

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

  test("renders localized structured threshold fields with category help", async () => {
    const user = userEvent.setup();
    renderEditor();

    const form = document.querySelector("form[data-slot='form']");
    expect(form).toHaveAttribute("id", "content-moderation-profile-form");
    expect(document.querySelectorAll("[data-slot='form-field']")).toHaveLength(22);
    expect(document.querySelector("[data-slot='form-field-info'].invisible")).toBeNull();

    expect(screen.queryByRole("combobox", { name: "Mode" })).toBeNull();
    expect(screen.getByRole("combobox", { name: "Check strategy" })).toHaveClass("w-full");

    const keywords = screen.getByLabelText("Blocked keywords");
    const keywordsHint = screen.getByText(
      "Matches are case-insensitive substrings. Empty lines and duplicates are removed.",
    );
    expect(keywords).toHaveAttribute("aria-describedby", keywordsHint.id);

    expect(screen.getByRole("spinbutton", { name: "Harassment" })).toHaveValue(0.98);
    expect(screen.getByRole("spinbutton", { name: "Harassment with threats" })).toHaveValue(0.9);
    expect(screen.getByRole("spinbutton", { name: "Graphic violence" })).toHaveValue(0.95);
    expect(screen.queryByRole("textbox", { name: "Category thresholds" })).toBeNull();
    expect(
      screen.getByText(
        "Set the model score at which each category is blocked. Lower values make moderation stricter.",
      ),
    ).toBeInTheDocument();

    const harassmentHelp = screen.getByRole("button", {
      name: /Content that demeans, intimidates, or abuses a person or group/,
    });
    await user.hover(harassmentHelp);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "A lower threshold flags lower-confidence matches, making moderation stricter.",
    );
  });

  test("provides zh-CN category labels", async () => {
    await i18n.changeLanguage("zh-CN");
    renderEditor();

    expect(screen.getByRole("spinbutton", { name: "骚扰" })).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "涉及未成年人的色情内容" })).toBeInTheDocument();
  });

  test("keeps moderation API fields and threshold inputs disabled in keyword-only mode", () => {
    renderEditor({ editedProfile: profile });

    expect(screen.getByLabelText("Moderation base URL")).toBeDisabled();
    expect(screen.getByLabelText("Moderation model")).toBeDisabled();
    expect(screen.getByLabelText("Moderation API key")).toBeDisabled();
    expect(screen.getAllByRole("spinbutton")).toHaveLength(13);
    for (const thresholdInput of screen.getAllByRole("spinbutton")) {
      expect(thresholdInput).toBeDisabled();
    }
    expect(screen.getByRole("switch", { name: "Clear the configured API key" })).not.toBeDisabled();
  });

  test("submits numeric thresholds through the existing create payload", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn<ProfileEditorModalProps["onSave"]>().mockResolvedValue(undefined);
    renderEditor({ onSave });

    fireEvent.change(screen.getByRole("textbox", { name: "Profile name" }), {
      target: { value: "  New Profile  " },
    });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Harassment" }), {
      target: { value: "0.42" },
    });
    fireEvent.change(screen.getByLabelText(/Moderation API key/), {
      target: { value: "sk-test" },
    });
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "New Profile",
        mode: "off",
        base_url: "https://api.openai.com",
        model: "omni-moderation-latest",
        api_key: "sk-test",
        timeout_ms: 3000,
        keyword_mode: "api_only",
        blocked_keywords: [],
        thresholds: { ...DEFAULT_THRESHOLDS, harassment: 0.42 },
        block_http_status: 403,
        block_message: "Your request was blocked by the content moderation policy.",
      }),
    );
    expect(onSave.mock.calls[0]?.[0]).not.toHaveProperty("version");
    expect(onSave.mock.calls[0]?.[0]).not.toHaveProperty("clear_api_key");
  });

  test.each([
    ["Moderation base URL", "Moderation base URL is required"],
    ["Moderation model", "Moderation model is required"],
    ["Moderation API key", "Moderation API key is required for this check strategy"],
  ])("requires %s in API mode", async (fieldLabel, message) => {
    const user = userEvent.setup();
    const onSave = vi.fn<ProfileEditorModalProps["onSave"]>().mockResolvedValue(undefined);
    renderEditor({ onSave });

    fireEvent.change(screen.getByRole("textbox", { name: "Profile name" }), {
      target: { value: "Required fields" },
    });
    fireEvent.change(screen.getByLabelText(new RegExp(fieldLabel)), {
      target: { value: " " },
    });
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(onSave).not.toHaveBeenCalled();
  });

  test("creates keyword-only profiles without moderation API credentials", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn<ProfileEditorModalProps["onSave"]>().mockResolvedValue(undefined);
    renderEditor({ onSave });

    fireEvent.change(screen.getByRole("textbox", { name: "Profile name" }), {
      target: { value: "Keywords only" },
    });
    await user.click(screen.getByRole("combobox", { name: "Check strategy" }));
    await user.click(screen.getByRole("option", { name: "Keywords only" }));
    fireEvent.change(screen.getByLabelText(/Blocked keywords/), {
      target: { value: " blocked \nBLOCKED\nsecond" },
    });
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        mode: "off",
        keyword_mode: "keyword_only",
        blocked_keywords: ["blocked", "second"],
      }),
    );
    expect(onSave.mock.calls[0]?.[0]).not.toHaveProperty("api_key");
  });

  test("preserves unknown server threshold keys when editing", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn<ProfileEditorModalProps["onSave"]>().mockResolvedValue(undefined);
    renderEditor({
      editedProfile: {
        ...profile,
        keyword_mode: "api_only",
        thresholds: { violence: 0.8, "future/category": 0.4 },
      },
      onSave,
    });

    expect(screen.getByRole("spinbutton", { name: "Violence" })).toHaveValue(0.8);
    fireEvent.change(screen.getByRole("spinbutton", { name: "Violence" }), {
      target: { value: "0.77" },
    });
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        version: 3,
        thresholds: {
          ...DEFAULT_THRESHOLDS,
          violence: 0.77,
          "future/category": 0.4,
        },
      }),
    );
    expect(onSave.mock.calls[0]?.[0]).not.toHaveProperty("mode");
  });

  test("rejects threshold values outside zero to one", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn<ProfileEditorModalProps["onSave"]>().mockResolvedValue(undefined);
    renderEditor({ onSave });

    fireEvent.change(screen.getByRole("textbox", { name: "Profile name" }), {
      target: { value: "Invalid thresholds" },
    });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Harassment" }), {
      target: { value: "1.1" },
    });
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Every category threshold must be a number from 0 to 1",
    );
    expect(onSave).not.toHaveBeenCalled();
  });
});
