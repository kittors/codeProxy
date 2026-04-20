import { describe, expect, test } from "vitest";
import { formatUpdateStatusMessage } from "@/modules/update/updateShared";

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
