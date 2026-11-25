import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const adminPanelRoot = path.resolve(__dirname, "../../..");

describe("Satin CSS cascade layer production guard", () => {
  const LAYER_ORDER_DECL = "@layer properties, theme, base, satin, components, utilities;";

  test.each(["index.html", "manage.html"])(
    "%s locks CSS cascade layer order in <head> before stylesheets and sets light/dark data-theme",
    (file) => {
      const html = fs.readFileSync(path.join(adminPanelRoot, file), "utf8");
      const layerIdx = html.indexOf(LAYER_ORDER_DECL);
      const headEndIdx = html.indexOf("</head>");
      expect(layerIdx).toBeGreaterThan(-1);
      expect(layerIdx).toBeLessThan(headEndIdx);
      expect(html).toContain('root.setAttribute("data-theme"');
      // 无 localStorage 偏好时也要显式调用 apply(...) 写入 data-theme="light" | "dark"
      expect(html).toMatch(/apply\(Boolean\(window\.matchMedia/);
    },
  );

  test("vite.config.ts never bundles Satin CSS into the eager vendor-satin chunk", () => {
    const config = fs.readFileSync(path.join(adminPanelRoot, "vite.config.ts"), "utf8");
    expect(config).toContain('id.includes("/css/md.css")');
    expect(config).toContain('if (id.endsWith(".css")) return undefined;');
  });

  test("satin-bridge.css imports shell.css and defaults to Satin native 8px control radius", () => {
    const bridge = fs.readFileSync(
      path.join(adminPanelRoot, "src/styles/satin-bridge.css"),
      "utf8",
    );
    expect(bridge).toContain('@import "satin-ui/css/shell.css";');
    expect(bridge).toContain("--sn-btn-r: 8px;");
    expect(bridge).not.toContain("--sn-btn-r: var(--sn-r-full); /* legacy */");
  });
});
