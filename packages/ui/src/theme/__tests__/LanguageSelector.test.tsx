import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test } from "vitest";
import i18n from "@code-proxy/i18n";
import { LanguageSelector } from "../LanguageSelector";

describe("LanguageSelector", () => {
  beforeEach(async () => {
    localStorage.clear();
    await i18n.changeLanguage("en");
  });

  test("renders translated language labels instead of missing translation keys", () => {
    render(<LanguageSelector className="inline-flex" />);

    fireEvent.click(screen.getByRole("button", { name: "Language" }));

    expect(screen.getByRole("option", { name: /中文/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /English/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Русский/ })).toBeInTheDocument();
    expect(screen.getAllByText("🇨🇳").length).toBeGreaterThan(0);
    expect(screen.getAllByText("🇬🇧").length).toBeGreaterThan(0);
    expect(screen.getAllByText("🇷🇺").length).toBeGreaterThan(0);
    expect(screen.queryByText(/nav\.language/)).not.toBeInTheDocument();
  });
});
