import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@code-proxy/i18n";
import { invalidateConfiguredModelAvailability } from "@features/model-availability";
import { ModelPlazaPage } from "../ModelPlazaPage";
import { ThemeProvider } from "@code-proxy/ui";
import { ToastProvider } from "@code-proxy/ui";

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  writeText: vi.fn(async () => undefined),
}));

vi.mock("@code-proxy/api-client", () => ({
  apiClient: {
    get: mocks.apiGet,
  },
  authFilesApi: {
    list: () => mocks.apiGet("/auth-files"),
    getModelsForAuthFile: async (name: string) => {
      const payload = await mocks.apiGet("/auth-files/models", { params: { name } });
      const record =
        payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
      return Array.isArray(record.models) ? record.models : [];
    },
  },
  providersApi: {
    getGeminiKeys: async () => [],
    getClaudeConfigs: async () => [],
    getCodexConfigs: async () => [],
    getClineConfigs: async () => [],
    getOpenCodeGoConfigs: async () => [],
    getOllamaCloudConfigs: async () => [],
    getVertexConfigs: async () => [],
    getOpenAIProviders: async () => [],
  },
}));

function renderPage() {
  return render(
    <ThemeProvider>
      <ToastProvider>
        <ModelPlazaPage />
      </ToastProvider>
    </ThemeProvider>,
  );
}

describe("ModelPlazaPage", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    window.localStorage.clear();
    invalidateConfiguredModelAvailability();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: mocks.writeText },
    });
    mocks.writeText.mockClear();
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === "/auth-group-model-owner-mappings") return Promise.resolve({ items: [] });
      if (path === "/model-path-availability") return Promise.resolve({ data: [] });
      if (path === "/model-configs?scope=library") return Promise.resolve({ data: [] });
      if (path === "/auth-files") return Promise.resolve({ files: [] });
      if (
        path === "/gemini-api-key" ||
        path === "/claude-api-key" ||
        path === "/codex-api-key" ||
        path === "/cline-api-key" ||
        path === "/vertex-api-key" ||
        path === "/openai-compatibility"
      ) {
        return Promise.resolve<unknown[]>([]);
      }
      return Promise.resolve({});
    });
  });

  test("shows only default root v1 model discovery results", async () => {
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === "/auth-group-model-owner-mappings") return Promise.resolve({ items: [] });
      if (path === "/model-path-availability") {
        return Promise.resolve({
          data: [
            {
              id: "gpt-root-model",
              paths: [{ scope: "root", method: "GET", path: "/v1/models" }],
            },
            {
              id: "gpt-group-only",
              paths: [{ scope: "group", method: "GET", path: "/team-a/v1/models" }],
            },
            {
              id: "gemini-v1beta-only",
              paths: [{ scope: "root", method: "GET", path: "/v1beta/models" }],
            },
          ],
        });
      }
      return Promise.resolve({});
    });

    renderPage();

    expect(await screen.findByText("gpt-root-model")).toBeInTheDocument();
    expect(screen.queryByText("gpt-group-only")).not.toBeInTheDocument();
    expect(screen.queryByText("gemini-v1beta-only")).not.toBeInTheDocument();
    expect(mocks.apiGet).toHaveBeenCalledWith("/model-path-availability");
  });

  test("filters available models by vendor tab and search", async () => {
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === "/auth-group-model-owner-mappings") return Promise.resolve({ items: [] });
      if (path === "/models/configured-availability") {
        return Promise.resolve({
          scoped: true,
          data: [
            {
              id: "gpt-5.4",
              description: "OpenAI flagship",
              pricing: {
                mode: "token",
                input_price_per_million: 2.5,
                output_price_per_million: 10,
                cached_price_per_million: 0.25,
              },
            },
            {
              id: "qwen3.5-plus",
              description: "Qwen chat model",
              pricing: {
                mode: "token",
                input_price_per_million: 0.4,
                output_price_per_million: 1.2,
              },
            },
            {
              id: "deepseek-chat",
              description: "DeepSeek chat",
            },
          ],
        });
      }
      if (path === "/model-path-availability") return Promise.resolve({ data: [] });
      return Promise.resolve({});
    });

    renderPage();

    expect(await screen.findByText("gpt-5.4")).toBeInTheDocument();
    expect(screen.getByText("qwen3.5-plus")).toBeInTheDocument();
    expect(screen.getByText("deepseek-chat")).toBeInTheDocument();
    expect(screen.getByTestId("model-plaza-grid")).toBeInTheDocument();
    expect(screen.getByText("OpenAI flagship")).toBeInTheDocument();
    expect(screen.getByText("$2.5")).toBeInTheDocument();
    expect(screen.getByText("$10")).toBeInTheDocument();
    expect(screen.getByText("$0.25")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: /qwen/i }));

    expect(screen.getByText("qwen3.5-plus")).toBeInTheDocument();
    expect(screen.queryByText("gpt-5.4")).not.toBeInTheDocument();
    expect(screen.queryByText("deepseek-chat")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: /all/i }));
    await userEvent.type(screen.getByPlaceholderText(/search models/i), "deepseek");

    expect(screen.getByText("deepseek-chat")).toBeInTheDocument();
    expect(screen.queryByText("gpt-5.4")).not.toBeInTheDocument();
    expect(screen.queryByText("qwen3.5-plus")).not.toBeInTheDocument();
  });

  test("copies model id from the card action", async () => {
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === "/auth-group-model-owner-mappings") return Promise.resolve({ items: [] });
      if (path === "/models/configured-availability") {
        return Promise.resolve({
          scoped: true,
          data: [{ id: "claude-sonnet-4", description: "Anthropic" }],
        });
      }
      if (path === "/model-path-availability") return Promise.resolve({ data: [] });
      return Promise.resolve({});
    });

    renderPage();

    const card = await screen.findByTestId("model-plaza-card");
    expect(within(card).getByText("claude-sonnet-4")).toBeInTheDocument();

    await userEvent.click(within(card).getByRole("button", { name: /copy model id/i }));

    await waitFor(() => {
      expect(mocks.writeText).toHaveBeenCalledWith("claude-sonnet-4");
    });
  });

  test("keeps configured mapped models and shows source on the card", async () => {
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === "/auth-group-model-owner-mappings") return Promise.resolve({ items: [] });
      if (path === "/models/configured-availability") {
        return Promise.resolve({
          scoped: true,
          uses_mapped_owners: true,
          data: [
            {
              id: "mimo-v2.5-pro",
              description: "Mapped Cline model",
              sources: [
                {
                  label: "cline · ClinePass",
                  provider: "cline",
                  model_id: "mimo-v2.5-pro",
                  upstream_model_id: "cline-pass/mimo-v2.5-pro",
                },
              ],
            },
          ],
        });
      }
      if (path === "/model-path-availability") {
        return Promise.resolve({
          data: [
            {
              id: "gpt-root-model",
              paths: [{ scope: "root", method: "GET", path: "/v1/models" }],
            },
          ],
        });
      }
      return Promise.resolve({});
    });

    renderPage();

    expect(await screen.findByText("mimo-v2.5-pro")).toBeInTheDocument();
    expect(screen.queryByText("gpt-root-model")).not.toBeInTheDocument();
    const source = screen.getByTestId("model-plaza-source");
    expect(source).toHaveTextContent(/cline/i);
    expect(source).toHaveTextContent(/mimo-v2\.5-pro/i);
  });

  test("pins vendor tabs with sticky styles and keeps page overflow open", async () => {
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === "/auth-group-model-owner-mappings") return Promise.resolve({ items: [] });
      if (path === "/models/configured-availability") {
        return Promise.resolve({
          scoped: true,
          data: [
            { id: "gpt-5.4", description: "OpenAI" },
            { id: "qwen3.5-plus", description: "Qwen" },
          ],
        });
      }
      if (path === "/model-path-availability") return Promise.resolve({ data: [] });
      return Promise.resolve({});
    });

    const { container } = renderPage();

    expect(await screen.findByText("gpt-5.4")).toBeInTheDocument();
    const sticky = screen.getByTestId("model-plaza-tabs-sticky");
    expect(sticky.className).toMatch(/(?:^|\s)sticky(?:\s|$)/);
    expect(sticky.className).toMatch(/(?:^|\s)top-0(?:\s|$)/);
    // overflow-x-hidden on an ancestor computes overflow-y as auto and breaks sticky
    expect(container.firstElementChild?.className ?? "").not.toMatch(/overflow-x-hidden/);
  });
});
