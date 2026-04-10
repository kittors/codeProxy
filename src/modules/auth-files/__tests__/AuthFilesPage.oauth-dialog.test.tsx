import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, test, vi } from "vitest";
import { ToastProvider } from "@/modules/ui/ToastProvider";
import { ThemeProvider } from "@/modules/ui/ThemeProvider";
import { AuthFilesPage } from "@/modules/auth-files/AuthFilesPage";

const mocks = vi.hoisted(() => ({
  list: vi.fn(async () => ({ files: [] })),
  getEntityStats: vi.fn(async () => ({ source: [], auth_index: [] })),
}));

vi.mock("@/lib/http/apis", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/http/apis")>();
  return {
    ...mod,
    authFilesApi: { ...mod.authFilesApi, list: mocks.list },
    usageApi: { ...mod.usageApi, getEntityStats: mocks.getEntityStats },
    oauthApi: {
      ...mod.oauthApi,
      startAuth: vi.fn(async () => ({ url: "", state: "" })),
      getAuthStatus: vi.fn(async () => ({ status: "waiting" })),
      submitCallback: vi.fn(async () => ({})),
      iflowCookieAuth: vi.fn(async () => ({ status: "ok" })),
    },
    vertexApi: { ...mod.vertexApi, importCredential: vi.fn(async () => ({})) },
  };
});

describe("AuthFilesPage OAuth login dialog", () => {
  test("opens OAuth dialog with provider/iFlow/Vertex tabs", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    const openBtn = await screen.findByRole("button", { name: "Add OAuth Login" });
    await user.click(openBtn);

    const dialog = await screen.findByRole("dialog");
    const scoped = within(dialog);

    expect(scoped.getByText("Add OAuth Login")).toBeInTheDocument();
    expect(scoped.getByRole("button", { name: "Codex OAuth" })).toBeInTheDocument();
    expect(scoped.getByRole("button", { name: "Anthropic OAuth" })).toBeInTheDocument();
    expect(scoped.getByRole("button", { name: "iFlow Cookie Auth" })).toBeInTheDocument();
    expect(scoped.getByRole("button", { name: "Vertex Credential Import" })).toBeInTheDocument();
  });
});
