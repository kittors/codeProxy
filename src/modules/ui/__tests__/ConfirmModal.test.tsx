import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import i18n from "@/i18n";
import { ConfirmModal } from "@/modules/ui/ConfirmModal";

const root = resolve(__dirname, "../../..");
const readModule = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("ConfirmModal", () => {
  afterEach(async () => {
    await i18n.changeLanguage("zh-CN");
  });

  test("renders default cancel text when cancelText is omitted", async () => {
    await i18n.changeLanguage("zh-CN");

    render(
      <ConfirmModal
        open
        title="确认删除"
        description="删除此配置？"
        confirmText="删除"
        onClose={() => undefined}
        onConfirm={() => undefined}
      />,
    );

    expect(screen.getByRole("button", { name: "取消" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "删除" })).toBeInTheDocument();
  });

  test("keeps modal close buttons as plain round icons with hover background only", () => {
    const sources = [
      readModule("modules/ui/Modal.tsx"),
      readModule("modules/monitor/log-content/rendering.tsx"),
      readModule("modules/monitor/ErrorDetailModal.tsx"),
    ];

    for (const source of sources) {
      const closeButtonClass =
        source
          .split(/<button|<motion\.button/)
          .find((buttonSource) => buttonSource.includes("<X"))
          ?.match(/className="([^"]+)"/)?.[1] ?? "";

      expect(closeButtonClass).toContain("rounded-full");
      expect(closeButtonClass).toContain("border-0");
      expect(closeButtonClass).toContain("bg-transparent");
      expect(closeButtonClass).toContain("shadow-none");
      expect(closeButtonClass).toContain("hover:bg-slate-100");
      expect(closeButtonClass).toContain("dark:hover:bg-white/10");
      expect(closeButtonClass).not.toContain("rounded-xl");
      expect(closeButtonClass).not.toContain("border border");
      expect(closeButtonClass).not.toContain("shadow-sm");
      expect(closeButtonClass).not.toMatch(/(^|\s)hover:bg-white(\s|$)/);
      expect(closeButtonClass).not.toContain("scale-");
    }
  });
});
