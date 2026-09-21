import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { RequestLogModelCell } from "../RequestLogModelCell";
import type { RequestLogsRow } from "../requestLogsRow";

const baseRow: RequestLogsRow = {
  id: "1",
  timestamp: "2026-09-21T08:00:00Z",
  timestampMs: Date.parse("2026-09-21T08:00:00Z"),
  apiKey: "sk-test1234567890",
  apiKeyId: "key-1",
  apiKeyName: "Primary",
  apiKeyOwnName: "Primary",
  endUserDisplayName: "Primary",
  isSystemCall: false,
  channelName: "Gemini",
  maskedApiKey: "sk-test****",
  model: "gemini-3.8-flash-high",
  upstreamModel: "",
  upstreamResponseModel: "",
  upstreamModelMismatch: false,
  visionFallbackModel: "",
  failed: false,
  streaming: true,
  latencyText: "1.2s",
  firstTokenText: "0.3s",
  inputTokens: 1,
  cachedTokens: 0,
  outputTokens: 1,
  totalTokens: 2,
  cost: 0,
  hasContent: false,
};

const MISMATCH_LABEL = /Upstream answered as a different model|上游响应模型不一致/;

describe("RequestLogModelCell upstream response audit", () => {
  test("flags a row the upstream answered as a different model", () => {
    render(
      <RequestLogModelCell
        row={{
          ...baseRow,
          upstreamModel: "gemini-3.8-flash",
          upstreamResponseModel: "gemini-3.8-flash-exp-a",
          upstreamModelMismatch: true,
        }}
      />,
    );

    const badge = screen.getByLabelText(MISMATCH_LABEL);
    expect(badge).toBeTruthy();
    // The observed name belongs in the accessible label, not only in the hover
    // tooltip, so the finding survives for screen readers and in tests.
    expect(badge.getAttribute("aria-label")).toContain("gemini-3.8-flash-exp-a");
  });

  test("stays quiet when the upstream answered as the model we sent", () => {
    render(
      <RequestLogModelCell
        row={{
          ...baseRow,
          upstreamModel: "gemini-3.8-flash",
          upstreamResponseModel: "gemini-3.8-flash",
          upstreamModelMismatch: false,
        }}
      />,
    );

    expect(screen.queryByLabelText(MISMATCH_LABEL)).toBeNull();
  });

  test("stays quiet when the upstream declared no model at all", () => {
    render(<RequestLogModelCell row={baseRow} />);

    expect(screen.queryByLabelText(MISMATCH_LABEL)).toBeNull();
  });

  test("does not flag a row whose verdict is set but carries no observed name", () => {
    // Defensive: a truthy flag with an empty name would render "≠" pointing at
    // nothing, which reads as a bug rather than as a finding.
    render(
      <RequestLogModelCell
        row={{ ...baseRow, upstreamResponseModel: "", upstreamModelMismatch: true }}
      />,
    );

    expect(screen.queryByLabelText(MISMATCH_LABEL)).toBeNull();
  });

  test("keeps the existing routing hints independent of the audit badge", () => {
    render(
      <RequestLogModelCell
        row={{
          ...baseRow,
          model: "fast",
          upstreamModel: "claude-sonnet-4-5",
          visionFallbackModel: "claude-opus-4-6",
          upstreamResponseModel: "claude-haiku-4-5",
          upstreamModelMismatch: true,
        }}
      />,
    );

    expect(screen.getByLabelText(/Real model ID|真实模型 ID/)).toBeTruthy();
    expect(screen.getByLabelText(/Vision fallback model ID|视觉补位模型 ID/)).toBeTruthy();
    expect(screen.getByLabelText(MISMATCH_LABEL)).toBeTruthy();
  });
});
