import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@code-proxy/i18n";
import { ThemeProvider } from "@code-proxy/ui";
import { WarmupPolicyModal } from "@pages/auth-files/components/WarmupPolicyModal";
import { fromLocalInputValue, toLocalInputValue } from "@pages/auth-files/components/warmupTime";

const mocks = vi.hoisted(() => ({
  getWarmupPolicies: vi.fn(),
  saveWarmupPolicy: vi.fn(),
}));

vi.mock("@code-proxy/api-client", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@code-proxy/api-client")>();
  return {
    ...mod,
    authFilesApi: {
      ...mod.authFilesApi,
      getWarmupPolicies: mocks.getWarmupPolicies,
      saveWarmupPolicy: mocks.saveWarmupPolicy,
    },
  };
});

function renderModal() {
  return render(
    <ThemeProvider>
      <WarmupPolicyModal open onClose={vi.fn()} allFileNames={["a@example.com", "b@example.com"]} />
    </ThemeProvider>,
  );
}

// CI 跑在 UTC 下，UTC 与本地时间相同，时区漂移的老问题在那里永远测不出来；固定到东八区。
beforeAll(() => {
  vi.stubEnv("TZ", "Asia/Shanghai");
});
afterAll(() => {
  vi.unstubAllEnvs();
});

describe("WarmupPolicyModal", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    mocks.saveWarmupPolicy.mockResolvedValue({});
  });

  test("a failed load blocks saving instead of overwriting the policy with defaults", async () => {
    mocks.getWarmupPolicies.mockRejectedValueOnce(new Error("boom"));
    renderModal();

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't load/i);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    mocks.getWarmupPolicies.mockResolvedValueOnce({ policies: [] });
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeEnabled());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  test("saving an untouched policy keeps its start time instead of shifting it by the timezone", async () => {
    const startAt = "2026-10-08T01:30:00.000Z";
    mocks.getWarmupPolicies.mockResolvedValue({
      policies: [{ enabled: true, start_at: startAt, providers: ["codex"], excluded_auth_ids: [] }],
    });
    renderModal();

    await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeEnabled());
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mocks.saveWarmupPolicy).toHaveBeenCalledTimes(1));
    expect(mocks.saveWarmupPolicy.mock.calls[0]?.[0]).toMatchObject({
      start_at: startAt,
      providers: ["codex"],
    });
  });

  test("excluded accounts are real checkboxes", async () => {
    mocks.getWarmupPolicies.mockResolvedValue({ policies: [] });
    renderModal();
    const account = await screen.findByRole("checkbox", { name: "b@example.com" });
    await userEvent.click(account);
    expect(account).toBeChecked();
    expect(screen.getByText("1 / 2 excluded")).toBeInTheDocument();
  });
});

describe("warmup time conversion", () => {
  test("round-trips an ISO time through the local datetime input value", () => {
    const iso = "2026-10-08T01:30:00.000Z";
    // 东八区本地时间是 09:30，不是 UTC 的 01:30。
    expect(toLocalInputValue(iso)).toBe("2026-10-08T09:30");
    expect(fromLocalInputValue(toLocalInputValue(iso))).toBe(iso);
    expect(toLocalInputValue("not a date")).toBe("");
    expect(fromLocalInputValue("")).toBe("");
  });
});
