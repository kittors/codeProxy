import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@/i18n";
import { ModelsPage } from "@/modules/models/ModelsPage";
import { ThemeProvider } from "@/modules/ui/ThemeProvider";
import { ToastProvider } from "@/modules/ui/ToastProvider";

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPut: vi.fn(),
}));

vi.mock("@/lib/http/client", () => ({
  apiClient: {
    get: mocks.apiGet,
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
});
