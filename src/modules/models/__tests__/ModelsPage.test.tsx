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
}));

vi.mock("@/lib/http/client", () => ({
  apiClient: {
    get: mocks.apiGet,
    post: mocks.apiPost,
    put: mocks.apiPut,
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
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    mocks.apiGet.mockReset();
    mocks.apiPost.mockReset();
    mocks.apiPut.mockReset();
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === "/model-configs") {
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
      if (path.startsWith("/usage/logs")) {
        return Promise.resolve({ stats: { total_cost: 12.34 } });
      }
      return Promise.resolve({});
    });
    mocks.apiPost.mockResolvedValue({ status: "ok" });
    mocks.apiPut.mockResolvedValue({ status: "ok" });
  });

  test("loads database-backed model configs and renders per-call pricing", async () => {
    renderPage();

    expect(await screen.findByText("gpt-image-2")).toBeInTheDocument();
    expect(screen.getByText("Image generation model billed per invocation")).toBeInTheDocument();
    expect(screen.getByText("$0.04 / call")).toBeInTheDocument();
    expect(mocks.apiGet).toHaveBeenCalledWith("/model-configs");
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

    await userEvent.type(screen.getByPlaceholderText(/search or add owner/i), "acme-ai");
    await userEvent.click(await screen.findByRole("option", { name: /add "acme-ai"/i }));
    await userEvent.click(within(dialog).getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(mocks.apiPut).toHaveBeenCalledWith(
        "/model-configs/gpt-image-2",
        expect.objectContaining({
          owned_by: "acme-ai",
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
});
