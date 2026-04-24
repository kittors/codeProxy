import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const root = resolve(__dirname, "../../..");

const readModule = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("RequestLogsPage layout", () => {
  test("uses a flex/min-h-0 chain so the table owns scrolling instead of the page", () => {
    const source = readModule("modules/monitor/RequestLogsPage.tsx");

    expect(source).toContain('<section className="flex min-h-0 flex-1 flex-col">');
    expect(source).toContain(
      '<div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-black/[0.06] bg-white',
    );
    expect(source).toContain('<div className="relative min-h-0 flex-1 overflow-hidden px-5">');
    expect(source).toContain('minHeight="min-h-0"');
    expect(source).not.toContain("h-[calc(100dvh-300px)]");
    expect(source).not.toContain('minHeight="min-h-full"');
  });
});
