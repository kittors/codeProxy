import { render } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import * as SatinIcons from "../icons";

describe("Satin Solar icons registry", () => {
  test("所有导出的 Satin 图标组件均映射到真实存在的 Satin Solar SVG 路径且不为空", () => {
    const entries = Object.entries(SatinIcons).filter(
      ([, value]) => typeof value === "function",
    ) as Array<[string, SatinIcons.SatinIconComponent]>;

    expect(entries.length).toBeGreaterThan(200);

    const missing: string[] = [];
    for (const [exportName, IconComp] of entries) {
      const { container, unmount } = render(<IconComp size={16} />);
      const svg = container.querySelector("svg.sn-ic");
      if (!svg || !svg.innerHTML.trim()) {
        missing.push(`${exportName} -> ${IconComp.satinName ?? "unknown"}`);
      }
      unmount();
    }

    expect(missing).toEqual([]);
  });
});
