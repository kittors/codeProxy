import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import i18n from "@code-proxy/i18n";
import { RequestDetailsView } from "../log-content/requestDetails";

const clock = (iso: string, language: string) =>
  new Intl.DateTimeFormat(language, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));

const failedOnA = {
  kind: "attempt",
  at: "2026-11-01T05:10:00.000+08:00",
  duration_ms: 1200,
  attempt: 1,
  group: "default",
  auth_id: "codex-a.json",
  auth_label: "Team A",
  provider: "codex",
  model: "gpt-5-codex",
  outcome: "failed",
  status: 429,
  cause: "rate_limited",
  error: "rate_limit: too many requests per minute",
  blocked: "cooldown",
  blocked_until: "2026-11-01T05:15:01.200+08:00",
};
const servedOnB = {
  kind: "attempt",
  at: "2026-11-01T05:10:01.250+08:00",
  duration_ms: 3400,
  attempt: 2,
  group: "default",
  auth_id: "codex-b.json",
  auth_label: "Team B",
  provider: "codex",
  model: "gpt-5-codex",
  outcome: "success",
  first_token_ms: 850,
};

function renderDetails(routeTrace: unknown, extra: Record<string, unknown> = {}) {
  const content = JSON.stringify({
    client: { ip: "203.0.113.8", method: "POST" },
    diagnostic: { request_id: "req-1", route_trace: routeTrace, ...extra },
  });
  return render(
    <RequestDetailsView
      content={content}
      egressInfo={null}
      egressLoading={false}
      egressError={null}
    />,
  );
}

describe("route timeline in the request details", () => {
  afterEach(async () => {
    await i18n.changeLanguage("zh-CN");
  });

  test("comes first, says how the request ended and lists each step", async () => {
    await i18n.changeLanguage("zh-CN");
    renderDetails({ steps: [failedOnA, servedOnB] });

    const sections = screen.getAllByRole("button", { expanded: true });
    expect(sections[0]).toHaveTextContent("路由时间线");
    const section = screen.getByTestId("request-detail-section-route");
    expect(within(section).getByText("2 次尝试")).toBeInTheDocument();
    expect(within(section).getByTestId("route-trace-summary")).toHaveTextContent(
      "前 1 次尝试失败，第 2 次由 Team B 完成。",
    );

    const steps = within(section).getAllByRole("listitem");
    expect(steps).toHaveLength(2);
    // The first step shows its clock time, the next one how long after the first it came.
    expect(steps[0]).toHaveTextContent(clock(failedOnA.at, "zh-CN"));
    expect(steps[1]).toHaveTextContent("+1.25s");
    expect(steps[0]).toHaveTextContent("第 1 次尝试");
    expect(steps[0]).toHaveTextContent("Team A · codex");
    expect(steps[0]).toHaveTextContent("失败");
    expect(steps[0]).toHaveTextContent("触发限流（429）");
    expect(steps[0]).toHaveTextContent(
      `暂停调度 5 分，至 ${clock(failedOnA.blocked_until, "zh-CN")}`,
    );
    expect(steps[0]).toHaveTextContent("rate_limit: too many requests per minute");
    expect(steps[0]).toHaveTextContent("模型 gpt-5-codex · 分组 default");
    expect(steps[1]).toHaveTextContent("成功");
    expect(steps[1]).toHaveTextContent("3.40s");
    expect(steps[1]).toHaveTextContent("850ms 后收到首 token");
    // The account id behind the channel name is a hover away.
    expect(within(steps[1]).getByTitle("codex-b.json")).toHaveTextContent("Team B");
  });

  test("the diagnostic section no longer flattens the trace into a JSON row", async () => {
    await i18n.changeLanguage("zh-CN");
    renderDetails({ steps: [servedOnB] });
    expect(screen.getByText("req-1")).toBeInTheDocument();
    expect(screen.queryByText("route_trace")).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain('"steps"');
  });

  test("a request log without a trace shows the details as before", async () => {
    await i18n.changeLanguage("zh-CN");
    renderDetails(undefined);
    expect(screen.queryByTestId("request-detail-section-route")).not.toBeInTheDocument();
    expect(screen.getByTestId("request-detail-section-client")).toBeInTheDocument();
  });

  test("a failed row names where the request went next and what the account was left in", async () => {
    await i18n.changeLanguage("en");
    const running = {
      ...servedOnB,
      outcome: undefined,
      duration_ms: undefined,
      first_token_ms: undefined,
    };
    renderDetails({ steps: [failedOnA, running] });
    const section = screen.getByTestId("request-detail-section-route");
    expect(within(section).getByTestId("route-trace-summary")).toHaveTextContent(
      [
        "Attempt 1 on Team A failed: Rate limited (429).",
        `Team A is paused for 5m, until ${clock(failedOnA.blocked_until, "en")}.`,
        "The request moved on to Team B.",
      ].join(" "),
    );
    expect(within(section).getAllByRole("listitem")[1]).toHaveTextContent("In progress");
  });

  test("Chinese sentences follow one another without a space", async () => {
    await i18n.changeLanguage("zh-CN");
    const running = {
      ...servedOnB,
      outcome: undefined,
      duration_ms: undefined,
      first_token_ms: undefined,
    };
    renderDetails({ steps: [failedOnA, running] });
    expect(screen.getByTestId("route-trace-summary").textContent).toBe(
      [
        "第 1 次尝试在 Team A 上失败：触发限流（429）。",
        `Team A 暂停调度 5 分，至 ${clock(failedOnA.blocked_until, "zh-CN")}。`,
        "请求换到了 Team B。",
      ].join(""),
    );
  });

  test("an exhausted pool lists why each account could not take the request", async () => {
    await i18n.changeLanguage("en");
    const unauthorized = {
      ...failedOnA,
      status: 401,
      cause: "unauthorized",
      blocked: "unavailable",
      blocked_until: undefined,
    };
    renderDetails({
      steps: [
        unauthorized,
        {
          kind: "exhausted",
          at: "2026-11-01T05:10:01.300+08:00",
          status: 429,
          error_code: "model_cooldown",
          error: "All credentials for model gpt-5-codex are cooling down",
          retry_after_ms: 42_000,
          candidates: [
            {
              auth_id: "codex-b.json",
              label: "Team B",
              provider: "codex",
              state: "cooldown",
              until: "2026-11-01T05:12:00+08:00",
              cause: "quota_exhausted",
              status: 429,
            },
            { auth_id: "codex-a.json", label: "Team A", provider: "codex", state: "tried" },
            { auth_id: "codex-c.json", provider: "codex", state: "saturated" },
          ],
          candidates_omitted: 2,
        },
      ],
    });
    const section = screen.getByTestId("request-detail-section-route");
    expect(within(section).getByTestId("route-trace-summary")).toHaveTextContent(
      [
        "Attempt 1 on Team A failed: Authorization rejected (401).",
        "Team A is paused until a probe or an operator brings it back.",
        "No other account could take the request.",
        `The first account is back at ${clock("2026-11-01T05:12:00+08:00", "en")}.`,
        "The client was told to retry in 42s.",
      ].join(" "),
    );
    const exhausted = within(section).getAllByRole("listitem")[1];
    expect(exhausted).toHaveTextContent("No account available");
    expect(exhausted).toHaveTextContent("429 · model_cooldown");
    expect(exhausted).toHaveTextContent("Why each account could not take it");
    expect(exhausted).toHaveTextContent(
      `Cooling down · until ${clock("2026-11-01T05:12:00+08:00", "en")} · Quota used up (429)`,
    );
    expect(exhausted).toHaveTextContent("Team A · codexAlready tried");
    expect(exhausted).toHaveTextContent("codex-c.json · codexAt its concurrency limit");
    expect(exhausted).toHaveTextContent("And 2 more accounts");
  });

  test("queues, waits, skips and the omitted middle of a long trace", async () => {
    await i18n.changeLanguage("en");
    const skip = {
      kind: "skip",
      at: "2026-11-01T05:10:01.260+08:00",
      reason: "saturated",
      auth_id: "codex-b.json",
      auth_label: "Team B",
      provider: "codex",
    };
    const queue = {
      kind: "queue",
      at: "2026-11-01T05:10:01.270+08:00",
      duration_ms: 2100,
      accounts: 1,
      outcome: "success",
      auth_id: "codex-b.json",
      auth_label: "Team B",
    };
    const wait = {
      kind: "wait",
      at: "2026-11-01T05:10:04+08:00",
      wait_kind: "busy-wait",
      planned_ms: 15_000,
    };
    const filler = Array.from({ length: 5 }, (_, index) => ({
      ...skip,
      at: `2026-11-01T05:10:0${index}+08:00`,
    }));
    renderDetails({
      steps: [failedOnA, skip, queue, ...filler, wait],
      omitted: 12,
      omitted_after: 8,
    });
    const section = screen.getByTestId("request-detail-section-route");
    const rows = within(section).getAllByRole("listitem");
    expect(rows).toHaveLength(10);
    expect(rows[1]).toHaveTextContent("SkippedTeam B · codexat its concurrency limit");
    expect(rows[2]).toHaveTextContent("Queued for a free slot");
    expect(rows[2]).toHaveTextContent("2.10s");
    expect(rows[2]).toHaveTextContent("1 busy account");
    expect(rows[2]).toHaveTextContent("A slot freed up on Team B");
    expect(rows[8]).toHaveTextContent("12 steps omitted");
    expect(rows[9]).toHaveTextContent("WaitedGroup busy waitIn progress");
    expect(rows[9]).toHaveTextContent("Planned 15.0s");
    expect(within(section).getByTestId("route-trace-summary")).toHaveTextContent(
      "The channel group waits while every account is busy: the request then waited about 15s for one to recover.",
    );
  });

  test("Russian plurals and the pinned badge", async () => {
    await i18n.changeLanguage("ru");
    renderDetails({
      pinned: true,
      steps: [{ ...failedOnA, cause: "upstream_error", status: 502, blocked: "" }],
    });
    const section = screen.getByTestId("request-detail-section-route");
    expect(within(section).getByText("1 попытка")).toBeInTheDocument();
    expect(within(section).getByText("Привязан к одному аккаунту")).toBeInTheDocument();
    expect(within(section).getByTestId("route-trace-summary")).toHaveTextContent(
      "На другом аккаунте не повторяли: запрос привязан к этому.",
    );
  });
  describe("a virtual model", () => {
    const member = (patch: Record<string, unknown>) => ({
      kind: "member",
      at: "2026-11-01T05:09:59.990+08:00",
      virtual_model: "smart",
      members: 3,
      ...patch,
    });
    const notAllowed = member({
      member: 1,
      group: "vip",
      model: "gpt-5",
      reason: "not_allowed",
      error: 'the API key may not use channel group "vip"',
    });
    const first = member({ member: 2, group: "team", model: "gpt-5-codex", reason: "first" });
    const fallback = member({
      at: "2026-11-01T05:10:01.240+08:00",
      member: 3,
      model: "claude-opus-4",
      reason: "fallback",
      status: 429,
      cause: "rate_limited",
      error: "rate_limit: too many requests per minute",
    });
    const servedOnClaude = {
      ...servedOnB,
      auth_id: "claude-c.json",
      auth_label: "Claude C",
      provider: "claude",
      model: "claude-opus-4",
    };

    test("the failed member's row says which member the request moved on to", async () => {
      await i18n.changeLanguage("zh-CN");
      renderDetails({ steps: [notAllowed, first, failedOnA, fallback] });
      const section = screen.getByTestId("request-detail-section-route");
      expect(within(section).getByText("虚拟模型 smart")).toBeInTheDocument();
      expect(within(section).getByTestId("route-trace-summary").textContent).toBe(
        [
          "第 1 次尝试在 Team A 上失败：触发限流（429）。",
          `Team A 暂停调度 5 分，至 ${clock(failedOnA.blocked_until, "zh-CN")}。`,
          "请求换到了 smart 的第 3 个成员（共 3 个）：claude-opus-4。",
        ].join(""),
      );
      const rows = within(section).getAllByRole("listitem");
      expect(rows).toHaveLength(4);
      expect(rows[0]).toHaveTextContent("第 1 个成员（共 3 个）vip/gpt-5不允许");
      expect(rows[0]).toHaveTextContent("Key 或请求路由不能用这个渠道分组");
      expect(rows[0]).toHaveTextContent('the API key may not use channel group "vip"');
      expect(rows[1]).toHaveTextContent("第 2 个成员（共 3 个）team/gpt-5-codex按顺序第一个");
      expect(rows[3]).toHaveTextContent("第 3 个成员（共 3 个）claude-opus-4后备");
      expect(rows[3]).toHaveTextContent("前一个成员失败：触发限流（429）。");
      // The error belongs to the member before; its own row already shows it.
      expect(rows[3]).not.toHaveTextContent("rate_limit: too many requests per minute");
    });

    test("a success names the member that served", async () => {
      await i18n.changeLanguage("en");
      renderDetails({ steps: [first, failedOnA, fallback, servedOnClaude] });
      expect(screen.getByTestId("route-trace-summary")).toHaveTextContent(
        [
          "Served by Claude C on attempt 2, after 1 failed attempt.",
          "It ran as member 3 of 3 of virtual model smart: claude-opus-4.",
        ].join(" "),
      );
    });

    test("a member that ran out of accounts, and no member left at all", async () => {
      await i18n.changeLanguage("en");
      const exhausted = {
        kind: "exhausted",
        at: "2026-11-01T05:10:01.230+08:00",
        status: 429,
        retry_after_ms: 42_000,
      };
      const { unmount } = renderDetails({ steps: [first, failedOnA, exhausted, fallback] });
      expect(screen.getByTestId("route-trace-summary")).toHaveTextContent(
        [
          "Attempt 1 on Team A failed: Rate limited (429).",
          `Team A is paused for 5m, until ${clock(failedOnA.blocked_until, "en")}.`,
          "No other account could take the request.",
          "The request moved on to member 3 of 3 of smart: claude-opus-4.",
        ].join(" "),
      );
      // The request did not wait: the retry the pass would have asked for is not mentioned.
      expect(screen.getByTestId("route-trace-summary")).not.toHaveTextContent("retry in");
      unmount();

      renderDetails({
        steps: [notAllowed, member({ member: 2, model: "gpt-5-codex", reason: "no_provider" })],
      });
      expect(screen.getByTestId("route-trace-summary")).toHaveTextContent(
        "No member of virtual model smart could take the request.",
      );
      expect(screen.getAllByRole("listitem")[1]).toHaveTextContent(
        "No account the request may use serves this model.",
      );
    });
  });
});
