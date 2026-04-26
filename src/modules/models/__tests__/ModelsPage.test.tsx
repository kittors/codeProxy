import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@/i18n";
import { ModelsPage } from "@/modules/models/ModelsPage";
import { ThemeProvider } from "@/modules/ui/ThemeProvider";
import { ToastProvider } from "@/modules/ui/ToastProvider";

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
}));

vi.mock("@/lib/http/client", () => ({
  apiClient: {
    get: mocks.apiGet,
    post: mocks.apiPost,
    put: mocks.apiPut,
    delete: mocks.apiDelete,
  },
}));

function renderPage() {
  return render(
    <ThemeProvider>
      <ToastProvider>
        <ModelsPage />
      </ToastProvider>
    </ThemeProvider>,
  );
}

describe("ModelsPage", () => {
  let ownerPresetItems: Array<{
    value: string;
    label: string;
    description: string;
    enabled?: boolean;
  }>;

  beforeEach(async () => {
    await i18n.changeLanguage("en");
    ownerPresetItems = [
      { value: "openai", label: "OpenAI", description: "OpenAI official models" },
      { value: "anthropic", label: "Anthropic", description: "Claude models" },
      { value: "acme-ai", label: "Acme AI", description: "Private preset owner" },
    ];
    mocks.apiGet.mockReset();
    mocks.apiPost.mockReset();
    mocks.apiPut.mockReset();
    mocks.apiDelete.mockReset();
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === "/model-configs?scope=active" || path === "/model-configs") {
        return Promise.resolve({
          data: [
            {
              id: "gpt-image-2",
              owned_by: "openai",
              description: "Image generation model billed per invocation",
              enabled: true,
              pricing: {
                mode: "call",
                price_per_call: 0.04,
              },
            },
          ],
        });
      }
      if (path === "/model-configs?scope=library") {
        return Promise.resolve({
          data: [
            {
              id: "seed-only-model",
              owned_by: "openai",
              description: "Seeded model library entry",
              enabled: true,
              source: "seed",
              pricing: {
                mode: "token",
                input_price_per_million: 1,
                output_price_per_million: 3,
              },
            },
          ],
        });
      }
      if (path === "/model-owner-presets") {
        return Promise.resolve({
          data: ownerPresetItems,
        });
      }
      if (path.startsWith("/usage/logs")) {
        return Promise.resolve({ stats: { total_cost: 12.34 } });
      }
      return Promise.resolve({});
    });
    mocks.apiPost.mockResolvedValue({ status: "ok" });
    mocks.apiPut.mockImplementation(
      (path: string, payload: { items?: typeof ownerPresetItems }) => {
        if (path === "/model-owner-presets" && Array.isArray(payload.items)) {
          ownerPresetItems = payload.items;
        }
        return Promise.resolve({ status: "ok" });
      },
    );
    mocks.apiDelete.mockResolvedValue({ status: "ok" });
  });

  test("loads database-backed model configs and renders per-call pricing", async () => {
    renderPage();

    expect(await screen.findByText("gpt-image-2")).toBeInTheDocument();
    expect(screen.getByText("Image generation model billed per invocation")).toBeInTheDocument();
    expect(screen.getByText("$0.04 / call")).toBeInTheDocument();
    expect(mocks.apiGet).toHaveBeenCalledWith("/model-configs?scope=active");
    expect(screen.queryByText("seed-only-model")).not.toBeInTheDocument();
  });

  test("loads the full model library only after switching to the library tab", async () => {
    renderPage();

    expect(await screen.findByText("gpt-image-2")).toBeInTheDocument();
    expect(screen.queryByText("seed-only-model")).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /owner management/i })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: /model library/i }));

    expect(await screen.findByText("seed-only-model")).toBeInTheDocument();
    expect(screen.getByText("Seeded model library entry")).toBeInTheDocument();
    expect(await screen.findByTestId("owner-library-layout")).toBeInTheDocument();
    expect(screen.getByTestId("owner-sidebar-card")).toHaveTextContent(/model owners/i);
    expect(screen.getByTestId("model-library-card")).toHaveTextContent(/seed-only-model/i);
    expect(mocks.apiGet).toHaveBeenCalledWith("/model-configs?scope=library");
  });

  test("deletes a model only after confirmation", async () => {
    renderPage();

    expect(await screen.findByText("gpt-image-2")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /delete gpt-image-2/i }));

    const confirmDialog = await screen.findByRole("dialog", {
      name: /delete model configuration/i,
    });
    expect(within(confirmDialog).getByText(/gpt-image-2/)).toBeInTheDocument();

    await userEvent.click(within(confirmDialog).getByRole("button", { name: /^delete$/i }));

    await waitFor(() => {
      expect(mocks.apiDelete).toHaveBeenCalledWith("/model-configs/gpt-image-2");
      expect(screen.queryByText("gpt-image-2")).not.toBeInTheDocument();
    });
  });

  test("saves model id, description, enabled state, pricing mode, and per-call price", async () => {
    renderPage();

    await screen.findByText("gpt-image-2");
    await userEvent.click(screen.getByRole("button", { name: /edit gpt-image-2/i }));

    const dialog = await screen.findByRole("dialog");
    await userEvent.clear(within(dialog).getByLabelText(/model id/i));
    await userEvent.type(within(dialog).getByLabelText(/model id/i), "gpt-image-2-hd");
    await userEvent.clear(within(dialog).getByLabelText(/description/i));
    await userEvent.type(within(dialog).getByLabelText(/description/i), "Updated image model");
    await userEvent.click(within(dialog).getByRole("combobox", { name: /pricing mode/i }));
    await userEvent.click(await screen.findByRole("option", { name: /per call/i }));
    await userEvent.clear(within(dialog).getByLabelText(/price per call/i));
    await userEvent.type(within(dialog).getByLabelText(/price per call/i), "0.08");
    await userEvent.click(within(dialog).getByRole("switch", { name: /enabled/i }));
    await userEvent.click(within(dialog).getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(mocks.apiPut).toHaveBeenCalledWith("/model-configs/gpt-image-2", {
        id: "gpt-image-2-hd",
        owned_by: "openai",
        description: "Updated image model",
        enabled: false,
        pricing: {
          mode: "call",
          price_per_call: 0.08,
        },
      });
    });
  });

  test("lets users choose preset owners or add a new owner from the owner dropdown", async () => {
    renderPage();

    await screen.findByText("gpt-image-2");
    await userEvent.click(screen.getByRole("button", { name: /edit gpt-image-2/i }));

    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("combobox", { name: /owner/i }));

    expect(await screen.findByRole("option", { name: "OpenAI" })).toBeInTheDocument();
    expect(await screen.findByRole("option", { name: "Anthropic" })).toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText(/search or add owner/i), "new-owner");
    await userEvent.click(await screen.findByRole("option", { name: /add "new-owner"/i }));
    await userEvent.click(within(dialog).getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(mocks.apiPut).toHaveBeenCalledWith(
        "/model-configs/gpt-image-2",
        expect.objectContaining({
          owned_by: "new-owner",
        }),
      );
    });
  });

  test("lets users choose a preset owner when adding a model", async () => {
    renderPage();

    await screen.findByText("gpt-image-2");
    await userEvent.click(screen.getByRole("button", { name: /add model/i }));

    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText(/model id/i), "claude-sonnet-4.5");
    await userEvent.click(within(dialog).getByRole("combobox", { name: /owner/i }));
    await userEvent.click(await screen.findByRole("option", { name: "Anthropic" }));
    await userEvent.click(within(dialog).getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(mocks.apiPost).toHaveBeenCalledWith(
        "/model-configs",
        expect.objectContaining({
          id: "claude-sonnet-4.5",
          owned_by: "anthropic",
        }),
      );
    });
  });

  test("maintains owner presets from the model library with an add-owner dialog", async () => {
    renderPage();

    await screen.findByText("gpt-image-2");
    await userEvent.click(screen.getByRole("tab", { name: /model library/i }));

    const ownerSidebar = await screen.findByTestId("owner-sidebar-card");
    expect(within(ownerSidebar).getByText("Acme AI")).toBeInTheDocument();

    await userEvent.click(within(ownerSidebar).getByRole("button", { name: /add owner/i }));
    const ownerDialog = await screen.findByRole("dialog", { name: /add owner/i });
    await userEvent.type(within(ownerDialog).getByLabelText(/owner value/i), "new-lab");
    await userEvent.type(within(ownerDialog).getByLabelText(/owner label/i), "New Lab");
    await userEvent.click(within(ownerDialog).getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(mocks.apiPut).toHaveBeenCalledWith(
        "/model-owner-presets",
        expect.objectContaining({
          items: expect.arrayContaining([
            expect.objectContaining({ value: "new-lab", label: "New Lab" }),
          ]),
        }),
      );
    });

    await userEvent.click(screen.getByRole("tab", { name: /active models/i }));
    await userEvent.click(screen.getByRole("button", { name: /add model/i }));
    const modelDialog = await screen.findByRole("dialog", { name: /add model/i });
    await userEvent.click(within(modelDialog).getByRole("combobox", { name: /owner/i }));

    expect(await screen.findByRole("option", { name: "Acme AI" })).toBeInTheDocument();
    expect(await screen.findByRole("option", { name: "New Lab" })).toBeInTheDocument();
  });

  test("deletes an owner preset only after confirmation", async () => {
    renderPage();

    await screen.findByText("gpt-image-2");
    await userEvent.click(screen.getByRole("tab", { name: /model library/i }));

    const ownerSidebar = await screen.findByTestId("owner-sidebar-card");
    await userEvent.click(within(ownerSidebar).getByRole("button", { name: /delete acme ai/i }));

    const confirmDialog = await screen.findByRole("dialog", {
      name: /delete owner preset/i,
    });
    expect(within(confirmDialog).getByText(/Acme AI/)).toBeInTheDocument();

    await userEvent.click(within(confirmDialog).getByRole("button", { name: /^delete$/i }));

    await waitFor(() => {
      expect(mocks.apiPut).toHaveBeenCalledWith(
        "/model-owner-presets",
        expect.objectContaining({
          items: expect.not.arrayContaining([expect.objectContaining({ value: "acme-ai" })]),
        }),
      );
    });
  });
});
