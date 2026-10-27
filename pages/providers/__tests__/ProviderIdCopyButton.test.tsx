import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import i18n from "@code-proxy/i18n";
import { ProviderIdCopyButton } from "@pages/providers/components/ProviderIdCopyButton";

// The button shows only an icon, so its aria-label is its whole name. While no
// locale defined providers.copy_channel_id, screen readers announced the raw key.
describe("ProviderIdCopyButton", () => {
  afterEach(async () => {
    await i18n.changeLanguage("en");
  });

  test.each([
    ["en", "Copy channel ID"],
    ["zh-CN", "复制渠道 ID"],
    ["ru", "Копировать ID канала"],
  ])("is named in %s", async (language, name) => {
    await i18n.changeLanguage(language);
    render(<ProviderIdCopyButton id="dd5f4013-e48c-4d89-9bdc-5204da2cd650" />);

    expect(screen.getByRole("button", { name })).toBeInTheDocument();
  });
});
