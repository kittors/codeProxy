// @vitest-environment node

import { describe, expect, it } from "vitest";
import { createPanelMetadata } from "./panelMetadata";

describe("createPanelMetadata", () => {
  it("derives a panel version from the current ref and commit when no explicit version is provided", () => {
    const metadata = createPanelMetadata({
      appVersion: "dev",
      buildDate: "2026-04-20T12:00:00.000Z",
      commit: "a28920de945ac13611eb88315cf5aff895bb8c78",
      ref: "dev",
      repository: "https://github.com/router-for-me/Cli-Proxy-API-Management-Center.git",
    });

    expect(metadata).toEqual({
      build_date: "2026-04-20T12:00:00.000Z",
      commit: "a28920de945ac13611eb88315cf5aff895bb8c78",
      ref: "dev",
      repository: "https://github.com/router-for-me/Cli-Proxy-API-Management-Center.git",
      version: "panel-dev-a28920d",
    });
  });

  it("preserves an explicit panel version from release builds", () => {
    const metadata = createPanelMetadata({
      appVersion: "panel-main-5e167b3",
      commit: "5e167b3d374ef34865e290e92804c54f108e76f9",
      ref: "main",
    });

    expect(metadata.version).toBe("panel-main-5e167b3");
  });
});
