import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const root = resolve(__dirname, "../../..");

const readModule = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("RequestLogsPage layout", () => {
  test("keeps viewport-adaptive table height while preventing page-level scrolling", () => {
    const source = readModule("modules/monitor/RequestLogsPage.tsx");

    expect(source).toContain('<section className="flex min-h-0 flex-1 flex-col">');
    expect(source).toContain(
      '<div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-black/[0.06] bg-white',
    );
    expect(source).toContain('className="relative min-h-[360px] flex-1 overflow-hidden px-5"');
    expect(source).toContain('height: "min(100%, calc(100dvh - 300px))"');
    expect(source).toContain('minHeight="min-h-full"');
  });
});
