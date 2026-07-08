import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import i18n from "@code-proxy/i18n";
import {
  OpenCodeGoUsageCardSection,
  createOpenCodeGoUsageStore,
} from "../OpenCodeGoUsageCardSection";

describe("OpenCodeGoUsageCardSection", () => {
  afterEach(async () => {
    await i18n.changeLanguage("en");
  });

  test("localizes compact Cline usage labels", async () => {
    await i18n.changeLanguage("zh-CN");
    const store = createOpenCodeGoUsageStore(
      {
        cline: {
          usage: [{ type: "five_hour", label: "5-Hour", percentage: 25, resets_in: "1h" }],
          updatedAt: 1,
        },
      },
      () => undefined,
    );

    render(
      <OpenCodeGoUsageCardSection
        cacheKey="cline"
        queryReady
        usageStore={store}
        windowTypes={["five_hour", "weekly", "monthly"]}
      />,
    );

    expect(screen.getByText("5 小时")).toBeInTheDocument();
    expect(screen.queryByText("5h")).not.toBeInTheDocument();
    expect(screen.queryByText("Sess")).not.toBeInTheDocument();
  });

  test("shows Ollama Cloud session usage as rolling usage", async () => {
    await i18n.changeLanguage("zh-CN");
    const store = createOpenCodeGoUsageStore(
      {
        ollama: {
          usage: [
            { type: "session", label: "Session", percentage: 20, resets_in: "1h" },
            { type: "weekly", label: "Weekly", percentage: 40, resets_in: "4d" },
          ],
          updatedAt: 1,
        },
      },
      () => undefined,
    );

    render(
      <OpenCodeGoUsageCardSection
        cacheKey="ollama"
        queryReady
        usageStore={store}
        windowTypes={["rolling", "weekly"]}
      />,
    );

    expect(screen.getByText("滚动")).toBeInTheDocument();
    expect(screen.getByText("每周")).toBeInTheDocument();
    expect(screen.getByText("剩余 80%")).toBeInTheDocument();
    expect(screen.queryByText("Sess")).not.toBeInTheDocument();
  });
});
