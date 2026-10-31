import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import i18n from "@code-proxy/i18n";
import type {
  RoutingSimulationCredential,
  RoutingSimulationResult as SimulationResult,
} from "@code-proxy/api-client/endpoints/routing-simulation";
import { RoutingSimulationResult } from "../RoutingSimulationResult";

const NOW = Date.parse("2026-11-01T00:00:00Z");
const at = (ms: number) => new Date(NOW + ms).toISOString();

const credential = (
  authID: string,
  extra: Partial<RoutingSimulationCredential> = {},
): RoutingSimulationCredential => ({
  "auth-id": authID,
  provider: "codex",
  weight: 1,
  "in-flight": 0,
  "load-ratio": 0,
  ...extra,
});

const unavailable = (
  credentials: RoutingSimulationCredential[],
  extra: Partial<NonNullable<SimulationResult["selection"]>> = {},
): SimulationResult => ({
  "api-key": { id: "key-1" },
  endpoint: "chat-completions",
  "requested-model": "gpt-5",
  stages: [{ name: "handler", outcome: "passed" }],
  selection: {
    model: "gpt-5",
    "model-key": "gpt-5",
    providers: ["codex"],
    groups: [{ name: "team", distribution: "reset-aware", credentials }],
    attempts: [],
    ...extra,
  },
});

afterEach(async () => {
  await i18n.changeLanguage("zh-CN");
});

describe("RoutingSimulationResult", () => {
  test("words durations and counts the Russian way", async () => {
    await i18n.changeLanguage("ru");
    render(
      <RoutingSimulationResult
        nowMs={NOW}
        result={unavailable(
          [
            credential("auth-1", {
              label: "Один",
              blocked: "cooldown",
              "blocked-until": at(60_000),
            }),
            credential("auth-2", {
              label: "Два",
              blocked: "cooldown",
              "blocked-until": at(5 * 60_000),
            }),
            credential("auth-3", {
              label: "Три",
              blocked: "unavailable",
              "blocked-until": at(22 * 60_000),
            }),
            ...["a", "b", "c", "d", "e"].map((id) =>
              credential(`excluded-${id}`, { excluded: "tried" }),
            ),
          ],
          { "retry-wait-ms": 120_000, "retry-wait-kind": "busy-wait" },
        )}
      />,
    );
    expect(
      screen.getByText(/запрос подождёт примерно 2 минуты, пока один из них/),
    ).toBeInTheDocument();
    expect(screen.getByText("Восстановится примерно через 1 минуту")).toBeInTheDocument();
    expect(screen.getByText("Восстановится примерно через 5 минут")).toBeInTheDocument();
    expect(screen.getByText("Восстановится примерно через 22 минуты")).toBeInTheDocument();
    expect(screen.getByText("5 аккаунтов не участвуют")).toBeInTheDocument();
  });

  test("lists the groups that keep an account out the way Chinese reads", async () => {
    await i18n.changeLanguage("zh-CN");
    render(
      <RoutingSimulationResult
        nowMs={NOW}
        result={unavailable([
          credential("auth-1", { excluded: "model", "model-not-allowed-by": ["team", "pro"] }),
          credential("auth-2", { excluded: "model" }),
          credential("auth-3", { excluded: "brand-new-reason" }),
        ])}
      />,
    );
    const reason = screen.getByText(/^分组 team.+pro 不允许这个模型$/);
    expect(reason.textContent).not.toContain(",");
    expect(screen.getByText("不提供这个模型")).toBeInTheDocument();
    // 后端以后新增的原因先原样显示。
    expect(screen.getByText("brand-new-reason")).toBeInTheDocument();
    expect(screen.getByText("不参与的账号（3）")).toBeInTheDocument();
    expect(screen.getByText("客户端会立即收到这个错误。")).toBeInTheDocument();
  });

  test("shows where a reset-aware group ranks each account", async () => {
    await i18n.changeLanguage("en");
    render(
      <RoutingSimulationResult
        nowMs={NOW}
        result={unavailable([
          credential("auth-1", {
            label: "Weekly",
            attempt: 1,
            reset: {
              tier: "low",
              used: 0.93,
              windows: [
                { key: "7d", used: 0.93, "resets-at": at(3 * 3_600_000) },
                { key: "5h", used: 0.2 },
              ],
            },
          }),
          credential("auth-2", { label: "Zero", blocked: "weight", weight: 0 }),
          credential("auth-3", { label: "Probing", blocked: "unavailable" }),
        ])}
      />,
    );
    const rows = within(screen.getByRole("table")).getAllByRole("row");
    expect(rows[1]).toHaveTextContent("Running low (a window is past 90%)");
    expect(rows[1]).toHaveTextContent("7d window: 93% used, resets in about 3 hours");
    expect(rows[1]).toHaveTextContent("5h window: 20% used");
    expect(rows[2]).toHaveTextContent("Unavailable for now");
    expect(rows[2]).toHaveTextContent("No recovery time yet");
    expect(rows[3]).toHaveTextContent("Weight 0, left out of distribution");
  });

  test("explains a group with no candidate and keeps stages it does not know", async () => {
    await i18n.changeLanguage("en");
    render(
      <RoutingSimulationResult
        nowMs={NOW}
        result={{
          "api-key": { id: "key-1" },
          endpoint: "chat-completions",
          "requested-model": "fast",
          stages: [
            { name: "auth", outcome: "passed" },
            { name: "content-check", outcome: "passed" },
            { name: "handler", outcome: "passed" },
          ],
          "model-policy": {
            "requested-model": "fast",
            "final-model": "gpt-5",
            "route-id": "cheap",
          },
          selection: {
            model: "gpt-5",
            "model-key": "gpt-5",
            providers: ["codex"],
            groups: [
              {
                name: "team",
                distribution: "weighted",
                credentials: [],
                error: { "http-status": 503, code: "auth_not_found", message: "no auth available" },
              },
              {
                name: "",
                fallback: true,
                distribution: "fill-first",
                sticky: true,
                credentials: [],
              },
            ],
            attempts: [],
          },
        }}
      />,
    );
    const stages = screen.getByRole("list", { name: "Stages the request goes through" });
    expect(within(stages).getByText("content-check")).toBeInTheDocument();
    expect(screen.getByText("Model policy rule cheap changes fast to gpt-5")).toBeInTheDocument();
    expect(screen.getByText("Group team")).toBeInTheDocument();
    expect(screen.getByText(/No candidate account in this group:/)).toHaveTextContent(
      "HTTP 503 · auth_not_found",
    );
    expect(screen.getByText("Default pool")).toBeInTheDocument();
    expect(screen.getByText("Fallback")).toBeInTheDocument();
    expect(screen.getByText(/Fill one before the next · Session sticky/)).toBeInTheDocument();
  });
});
