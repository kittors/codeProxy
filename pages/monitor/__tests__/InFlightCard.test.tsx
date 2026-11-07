import { act, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@code-proxy/i18n";
import { normalizeMonitorInFlight, type MonitorInFlight } from "@code-proxy/api-client";
import { IN_FLIGHT_SLOW_STAGE_MS, InFlightCard } from "../components/InFlightCard";

const RECEIVED_AT = Date.parse("2026-11-01T05:30:00+08:00");

const inFlight = (requests: unknown[], total = requests.length): MonitorInFlight =>
  normalizeMonitorInFlight({ requests, total, generated_at: "2026-11-01T05:30:00+08:00" });

const streaming = {
  request_id: "req-stream",
  method: "POST",
  path: "/v1/messages",
  started_at: "2026-11-01T05:29:00+08:00",
  elapsed_ms: 60_000,
  stage: "streaming",
  stage_elapsed_ms: 55_000,
  model: "claude-sonnet-5-5",
  stream: true,
  attempt: 1,
  account: { auth_id: "claude-a.json", label: "Team A", provider: "claude", group: "default" },
  api_key_id: "key-7",
  api_key_name: "CI",
};
const firstToken = {
  request_id: "req-first-token",
  method: "POST",
  path: "/v1/responses",
  started_at: "2026-11-01T05:29:50+08:00",
  elapsed_ms: 10_000,
  stage: "first_token",
  stage_elapsed_ms: IN_FLIGHT_SLOW_STAGE_MS - 2_000,
  model: "gpt-5",
  stream: true,
  attempt: 2,
  account: {
    auth_id: "codex-b.json",
    label: "",
    provider: "codex",
    group: "",
    model: "gpt-5-codex",
  },
  api_key_id: "key-9",
  api_key_name: "",
};
const preparing = {
  request_id: "req-new",
  started_at: "2026-11-01T05:29:59+08:00",
  elapsed_ms: 400,
  stage: "preparing",
  stage_elapsed_ms: 400,
  model: "gpt-5",
};

function renderCard(data: MonitorInFlight | null, error = false) {
  return render(<InFlightCard inFlight={data} receivedAt={RECEIVED_AT} error={error} />);
}

describe("InFlightCard", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    vi.setSystemTime(RECEIVED_AT);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("lists each request with its stage, time, account and key", () => {
    renderCard(inFlight([streaming, firstToken, preparing]));
    expect(screen.getByRole("heading", { name: /^Requests in flight/ })).toHaveTextContent(
      "3 requests on this node",
    );
    const rows = screen.getAllByTestId("in-flight-row");
    expect(rows).toHaveLength(3);

    expect(rows[0]).toHaveTextContent("Streaming");
    expect(rows[0]).toHaveTextContent("1m 00s so far");
    expect(rows[0]).toHaveTextContent("55.0s in this stage");
    expect(rows[0]).toHaveTextContent("claude-sonnet-5-5 · stream");
    expect(rows[0]).toHaveTextContent("POST /v1/messages");
    expect(rows[0]).toHaveTextContent("Team A · claude");
    expect(rows[0]).toHaveTextContent("Attempt 1 · Group default");
    expect(rows[0]).toHaveTextContent("CI");
    // A long channel name is cut off in the cell; hovering shows it in full with the account id.
    expect(within(rows[0]).getByText("Team A")).toHaveAttribute("title", "Team A\nclaude-a.json");
    // A long stream is not stuck: streaming never counts as slow.
    expect(rows[0]).not.toHaveAttribute("data-slow");

    // No channel name: the account id stands in; the upstream model shows when an alias changed it.
    expect(rows[1]).toHaveTextContent("Waiting for first token");
    expect(rows[1]).toHaveTextContent("codex-b.json · codex");
    expect(within(rows[1]).getByText("codex-b.json")).toHaveAttribute("title", "codex-b.json");
    expect(rows[1]).toHaveTextContent("Attempt 2 · gpt-5-codex");
    expect(within(rows[1]).getByTitle("key-9")).toHaveTextContent("key-9");

    expect(rows[2]).toHaveTextContent("Preparing");
    expect(rows[2]).toHaveTextContent("Not placed on an account yet");
    expect(rows[2]).toHaveTextContent("400ms so far");
  });

  test("times keep running between two fetches and a stage stuck past 15s is marked", () => {
    renderCard(inFlight([firstToken]));
    const row = () => screen.getByTestId("in-flight-row");
    expect(row()).toHaveTextContent("13.0s in this stage");
    expect(row()).not.toHaveAttribute("data-slow");

    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(row()).toHaveTextContent("12.0s so far");
    expect(row()).toHaveTextContent("15.0s in this stage");
    expect(row()).toHaveAttribute("data-slow", "true");
    expect(within(row()).getByTitle("In this stage for over 15 seconds")).toBeInTheDocument();
  });

  test("says how many of how many it lists when the backend caps the list", () => {
    renderCard(inFlight([streaming], 640));
    expect(screen.getByRole("heading", { name: /^Requests in flight/ })).toHaveTextContent(
      "The oldest 1 of 640 on this node",
    );
  });

  test("an empty list and a failed load each say so", () => {
    const { unmount } = renderCard(inFlight([]));
    expect(screen.getByText("Nothing in flight right now")).toBeInTheDocument();
    unmount();
    renderCard(null, true);
    expect(screen.getByText("Could not load the requests in flight")).toBeInTheDocument();
  });

  test("an unknown stage from a newer backend is shown as sent", async () => {
    await i18n.changeLanguage("zh-CN");
    renderCard(
      inFlight([
        { ...preparing, stage: "moderating" },
        { ...firstToken, stage: "queued" },
      ]),
    );
    const rows = screen.getAllByTestId("in-flight-row");
    expect(rows[0]).toHaveTextContent("moderating");
    expect(rows[1]).toHaveTextContent("排队");
    expect(screen.getByRole("heading", { name: /^在途请求/ })).toHaveTextContent("本节点 2 个");
  });
});
