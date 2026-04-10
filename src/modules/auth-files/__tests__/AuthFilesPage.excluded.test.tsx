import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, test, vi } from "vitest";
import { ToastProvider } from "@/modules/ui/ToastProvider";
import { ThemeProvider } from "@/modules/ui/ThemeProvider";
import { AuthFilesPage } from "@/modules/auth-files/AuthFilesPage";

const mocks = vi.hoisted(() => ({
  list: vi.fn(async () => ({ files: [] })),
  getOauthExcludedModels: vi.fn(async () => ({})),
  getUsage: vi.fn(async () => ({ apis: {} })),
  getEntityStats: vi.fn(async () => ({ source: [], auth_index: [] })),
}));

vi.mock("@/lib/http/apis", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/http/apis")>();
  return {
    ...mod,
    authFilesApi: {
      ...mod.authFilesApi,
      list: mocks.list,
      getOauthExcludedModels: mocks.getOauthExcludedModels,
    },
    usageApi: { ...mod.usageApi, getUsage: mocks.getUsage, getEntityStats: mocks.getEntityStats },
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

describe("AuthFilesPage OAuth excluded models", () => {
  test("does not refetch endlessly when excluded models map is empty", async () => {
    render(
      <MemoryRouter initialEntries={["/auth-files?tab=excluded"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(mocks.getOauthExcludedModels).toHaveBeenCalledTimes(1);
    });

    expect(await screen.findByText("No config")).toBeInTheDocument();

    await new Promise((r) => setTimeout(r, 30));
    expect(mocks.getOauthExcludedModels).toHaveBeenCalledTimes(1);
  });
});
