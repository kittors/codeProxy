import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@code-proxy/i18n";
import { normalizeMonitorOverview } from "@code-proxy/api-client";
import { FailureCard } from "../components/FailureCard";

// Loop protection's interceptions are failed requests of their own kind, counted in the
// failure analysis. The card says how many were stopped on purpose, and only when a
// backend that has loop protection actually stopped something.

const NO_FILTERS = { channels: [], models: [], consumers: [] };

function renderCard(
  loopGuard: unknown,
  { failed = 7, legacy = false }: { failed?: number; legacy?: boolean } = {},
) {
  const overview = normalizeMonitorOverview({
    summary: { current: { requests: 100, failed } },
    ...(loopGuard === undefined ? {} : { loop_guard: loopGuard }),
  });
  return render(
    <FailureCard
      overview={overview}
      legacy={legacy}
      loading={false}
      canViewDetail
      activeFilters={NO_FILTERS}
      onSelect={vi.fn()}
    />,
  );
}

const summary = () => screen.queryByRole("region", { name: "Loop protection" });

describe("FailureCard loop protection summary", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  test("lists what was stopped, the estimated saving, and that it was on purpose", () => {
    renderCard({ reply_loops: 3, tool_loops: 12, estimated_saved_cost: 1.2345 });
    const region = summary()!;
    expect(region).toBeInTheDocument();
    expect(within(region).getByText("Replies cut for repeating").nextSibling).toHaveTextContent(
      "3",
    );
    expect(
      within(region).getByText("Tool-call loops answered by the gateway").nextSibling,
    ).toHaveTextContent("12");
    expect(
      within(region).getByText("Upstream cost avoided (estimate)").nextSibling,
    ).toHaveTextContent("$1.23");
    expect(region).toHaveTextContent(/Stopped on purpose, and counted among the failures/);
  });

  test("leaves out a kind that stopped nothing, and the saving when none could be priced", () => {
    renderCard({ reply_loops: 0, tool_loops: 4, estimated_saved_cost: 0 });
    const region = summary()!;
    expect(within(region).queryByText("Replies cut for repeating")).toBeNull();
    expect(within(region).getByText("Tool-call loops answered by the gateway")).toBeInTheDocument();
    expect(within(region).queryByText("Upstream cost avoided (estimate)")).toBeNull();
  });

  test("a small saving is not rounded to nothing", () => {
    renderCard({ reply_loops: 0, tool_loops: 1, estimated_saved_cost: 0.0042 });
    expect(
      within(summary()!).getByText("Upstream cost avoided (estimate)").nextSibling,
    ).toHaveTextContent("$0.0042");
  });

  test.each([
    ["a backend without loop protection (no summary at all)", undefined],
    [
      "a backend that has it and stopped nothing",
      { reply_loops: 0, tool_loops: 0, estimated_saved_cost: 0 },
    ],
    ["a summary that is not one", "yes"],
  ])("no section for %s", (_name, loopGuard) => {
    renderCard(loopGuard);
    expect(summary()).toBeNull();
    // The rest of the card is the failure analysis it always was.
    expect(screen.getByText("Failure analysis")).toBeInTheDocument();
  });

  test("no section on the compatibility view of an old backend", () => {
    renderCard({ reply_loops: 3, tool_loops: 1, estimated_saved_cost: 1 }, { legacy: true });
    expect(summary()).toBeNull();
  });

  test("no section when nothing failed", () => {
    renderCard({ reply_loops: 0, tool_loops: 0, estimated_saved_cost: 0 }, { failed: 0 });
    expect(summary()).toBeNull();
  });
});
