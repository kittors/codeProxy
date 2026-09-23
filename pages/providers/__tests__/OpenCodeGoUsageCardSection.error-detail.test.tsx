import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import {
  createOpenCodeGoUsageStore,
  OpenCodeGoUsageCardSection,
} from "@pages/providers/components/OpenCodeGoUsageCardSection";

const renderWithError = (error: string) => {
  const usageStore = createOpenCodeGoUsageStore(
    { card: { usage: [], updatedAt: Date.now(), error } },
    () => {},
  );
  render(<OpenCodeGoUsageCardSection cacheKey="card" usageStore={usageStore} queryReady />);
};

describe("OpenCodeGoUsageCardSection error detail", () => {
  // The card swaps a long reason for a generic line to stay one line tall, but
  // the reason is what tells a Cloudflare page from a missing plan.
  test("keeps a long usage error one hover away", () => {
    const reason = "OpenCode Go usage API returned HTTP 403 (text/html): Just a moment...";
    renderWithError(reason);

    expect(screen.getByText("Usage query failed")).toHaveAttribute("title", reason);
  });

  test("shows a short usage error as is", () => {
    const reason = "OpenCode Go usage API: OpenCode Go subscription required.";
    renderWithError(reason);

    expect(screen.getByText(reason)).toHaveAttribute("title", reason);
  });
});
