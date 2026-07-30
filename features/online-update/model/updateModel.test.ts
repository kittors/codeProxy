import { describe, expect, test } from "vitest";
import { selectLocalizedReleaseNotes } from "./releaseNotes";
import { formatUpdateStatusMessage, formatBytes, progressPercent } from "./updateModel";

describe("formatUpdateStatusMessage", () => {
  test("splits degraded update status clauses onto separate lines", () => {
    const message =
      'service update check degraded: github commit status 403: {"message":"API rate limit exceeded"}; management UI update check degraded: github commit status 403: {"message":"API rate limit exceeded"}';

    expect(formatUpdateStatusMessage(message)).toBe(
      'service update check degraded: github commit status 403: {"message":"API rate limit exceeded"};\nmanagement UI update check degraded: github commit status 403: {"message":"API rate limit exceeded"}',
    );
  });

  test("keeps ordinary status messages unchanged", () => {
    expect(formatUpdateStatusMessage("already up to date")).toBe("already up to date");
  });
});

describe("selectLocalizedReleaseNotes", () => {
  const bilingualNotes = [
    "v0.4.0 - dev 全量合并发布 / Full dev-to-main release",
    "",
    "中文",
    "",
    "这是中文更新说明。",
    "",
    "- 后端架构整理",
    "",
    "English",
    "",
    "This is the English release note.",
    "",
    "- Backend architecture cleanup",
  ].join("\n");

  test("selects the English section and localizes the bilingual heading", () => {
    expect(selectLocalizedReleaseNotes(bilingualNotes, "en")).toBe(
      [
        "v0.4.0 - Full dev-to-main release",
        "",
        "This is the English release note.",
        "",
        "- Backend architecture cleanup",
      ].join("\n"),
    );
  });

  test("keeps the Chinese section for Chinese UI", () => {
    expect(selectLocalizedReleaseNotes(bilingualNotes, "zh-CN")).toBe(
      ["v0.4.0 - dev 全量合并发布", "", "这是中文更新说明。", "", "- 后端架构整理"].join("\n"),
    );
  });

  test("falls back to English for locales without a dedicated release section", () => {
    expect(selectLocalizedReleaseNotes(bilingualNotes, "ru")).toContain(
      "This is the English release note.",
    );
  });
});

describe("progressPercent", () => {
  // The updater used to omit a zero percent from its payload, which the modal read
  // as "no progress reporting" and rendered as a full bar — at the moment an update
  // started. A reported zero must stay distinguishable from an absent value.
  test("keeps a reported zero distinct from a missing value", () => {
    expect(progressPercent({ status: "running", progress_percent: 0 })).toBe(0);
    expect(progressPercent({ status: "running" })).toBeNull();
    expect(progressPercent(null)).toBeNull();
  });

  test("clamps values outside the range", () => {
    expect(progressPercent({ status: "running", progress_percent: 140 })).toBe(100);
    expect(progressPercent({ status: "running", progress_percent: -5 })).toBe(0);
  });

  test("ignores non-finite values", () => {
    expect(progressPercent({ status: "running", progress_percent: Number.NaN })).toBeNull();
  });
});

describe("formatBytes", () => {
  test("renders docker-style decimal units", () => {
    expect(formatBytes(512)).toBe("512B");
    expect(formatBytes(310_400)).toBe("310.4kB");
    expect(formatBytes(30_430_000)).toBe("30.4MB");
  });

  test("renders nothing for absent or zero sizes", () => {
    expect(formatBytes(0)).toBe("");
    expect(formatBytes(undefined)).toBe("");
  });
});
