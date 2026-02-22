import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, test, vi } from "vitest";
import { ToastProvider } from "@/modules/ui/ToastProvider";
import { AuthFilesPage } from "@/modules/auth-files/AuthFilesPage";

const mocks = vi.hoisted(() => ({
  list: vi.fn(async () => ({ files: [] })),
  getOauthExcludedModels: vi.fn(async () => ({})),
  getUsage: vi.fn(async () => ({ apis: {} })),
}));

vi.mock("@/lib/http/apis", () => ({
  authFilesApi: {
    list: mocks.list,
    getOauthExcludedModels: mocks.getOauthExcludedModels,
  },
  usageApi: {
    getUsage: mocks.getUsage,
  },
}));

describe("AuthFilesPage OAuth excluded models", () => {
  test("does not refetch endlessly when excluded models map is empty", async () => {
    render(
      <MemoryRouter initialEntries={["/auth-files?tab=excluded"]}>
        <ToastProvider>
          <Routes>
            <Route path="/auth-files" element={<AuthFilesPage />} />
          </Routes>
        </ToastProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(mocks.getOauthExcludedModels).toHaveBeenCalledTimes(1);
    });

    expect(await screen.findByText("暂无配置")).toBeInTheDocument();

    await new Promise((r) => setTimeout(r, 30));
    expect(mocks.getOauthExcludedModels).toHaveBeenCalledTimes(1);
  });
});
