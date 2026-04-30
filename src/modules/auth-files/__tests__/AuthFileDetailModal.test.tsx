import type { ComponentProps } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { AuthFileDetailModal } from "@/modules/auth-files/components/AuthFileDetailModal";
import i18n from "@/i18n";

type DetailModalProps = ComponentProps<typeof AuthFileDetailModal>;

const basePrefixProxyEditor: DetailModalProps["prefixProxyEditor"] = {
  open: true,
  fileName: "codex.json",
  loading: false,
  saving: false,
  error: null,
  json: { prefix: "team-a", proxy_id: "primary", proxy_url: "http://127.0.0.1:7890" },
  prefix: "team-a",
  proxyUrl: "http://127.0.0.1:7890",
  proxyId: "primary",
  subscriptionStartedAt: "2026-04-01T08:30",
  subscriptionPeriod: "monthly",
};

const renderDetailModal = (overrides: Partial<DetailModalProps> = {}) => {
  const props: DetailModalProps = {
    open: true,
    detailFile: {
      name: "codex.json",
      label: "Codex Primary",
      type: "codex",
      size: 256,
      account_type: "oauth",
    },
    detailLoading: false,
    detailText: '{"token":"abc","nested":{"enabled":true}}',
    detailTab: "fields",
    setDetailOpen: vi.fn(),
    setDetailTab: vi.fn(),
    loadModelsForDetail: vi.fn(async () => undefined),
    loadModelOwnerGroups: vi.fn(async () => undefined),
    modelsLoading: false,
    modelsError: null,
    modelsList: [
      { id: "gpt-5.1", display_name: "GPT 5.1", owned_by: "openai" },
      { id: "gpt-5.1-mini", owned_by: "openai" },
    ],
    modelsFileType: "codex",
    modelOwnerGroupsLoading: false,
    mappedModelOwnerGroup: null,
    mappedModelOwnerValue: "",
    excluded: {},
    prefixProxyEditor: basePrefixProxyEditor,
    setPrefixProxyEditor: vi.fn(),
    prefixProxyDirty: true,
    savePrefixProxy: vi.fn(async () => undefined),
    proxyPoolEntries: [
      {
        id: "primary",
        name: "Primary egress",
        url: "http://127.0.0.1:7890",
        enabled: true,
      },
    ],
    channelEditor: {
      open: true,
      fileName: "codex.json",
      label: "Codex Primary",
      saving: false,
      error: null,
    },
    setChannelEditor: vi.fn(),
    saveChannelEditor: vi.fn(async () => true),
    ...overrides,
  };

  render(<AuthFileDetailModal {...props} />);
  return props;
};

describe("AuthFileDetailModal", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    window.localStorage.clear();
  });

  test("uses fields as the primary view without content or channel tabs", () => {
    renderDetailModal();

    expect(screen.queryByTestId("auth-file-json-reader")).not.toBeInTheDocument();
    expect(screen.queryByText(/"token"/)).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Content" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Info" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Channel" })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Fields" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("e.g. Gemini Primary")).toHaveValue("Codex Primary");
    expect(screen.getByRole("dialog", { name: "View: codex.json" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download" })).toBeEnabled();
  });

  test("renders models as a compact list without raw field labels", () => {
    renderDetailModal({ detailTab: "models" });

    const list = screen.getByTestId("auth-file-models-list");
    expect(within(list).getByText("gpt-5.1")).toBeInTheDocument();
    expect(within(list).getByText("GPT 5.1")).toBeInTheDocument();
    expect(within(list).getAllByText("openai")).toHaveLength(2);
    expect(screen.getByText("2 items")).toBeInTheDocument();
    expect(screen.queryByText(/display_name:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/owned_by:/)).not.toBeInTheDocument();
  });

  test("keeps field editing controls without showing JSON in the modal", () => {
    renderDetailModal({ detailTab: "fields" });

    const grid = screen.getByTestId("auth-file-fields-grid");
    expect(within(grid).getByPlaceholderText("e.g. team-a")).toHaveValue("team-a");
    expect(within(grid).getByLabelText("proxy_id (proxy pool)")).toBeInTheDocument();
    expect(within(grid).getByPlaceholderText("e.g. http://127.0.0.1:7890")).toHaveValue(
      "http://127.0.0.1:7890",
    );
    expect(within(grid).getByLabelText(/Subscription start/)).toBeInTheDocument();
    expect(screen.queryByTestId("auth-file-fields-preview")).not.toBeInTheDocument();
    expect(screen.queryByText(/"prefix"/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  test("keeps the OAuth channel rename action available in fields", () => {
    const saveChannelEditor = vi.fn(async () => true);
    const props = renderDetailModal({
      detailTab: "fields",
      channelEditor: {
        open: true,
        fileName: "codex.json",
        label: "Codex Team A",
        saving: false,
        error: null,
      },
      saveChannelEditor,
    });

    fireEvent.change(screen.getByPlaceholderText("e.g. Gemini Primary"), {
      target: { value: "Codex Team B" },
    });
    expect(props.setChannelEditor).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(saveChannelEditor).toHaveBeenCalled();
  });
});
