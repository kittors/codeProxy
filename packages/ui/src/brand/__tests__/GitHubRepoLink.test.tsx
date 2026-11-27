import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import {
  GITHUB_PANEL_SLUG,
  GITHUB_PANEL_URL,
  GITHUB_PROJECT_SLUG,
  GITHUB_PROJECT_URL,
  GitHubRepoLink,
} from "../GitHubRepoLink";

describe("GitHubRepoLink", () => {
  test("renders topbar link pointing to CliRelay repository with GitHub icon and safe attrs", () => {
    render(<GitHubRepoLink variant="topbar" />);

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", GITHUB_PROJECT_URL);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveAttribute("data-tip");
    expect(link.querySelector("svg")).not.toBeNull();
    expect(link).toHaveTextContent("GitHub");
  });

  test("renders badge variant showing repository slug by default and allows custom href", () => {
    const { rerender } = render(<GitHubRepoLink variant="badge" />);
    expect(screen.getByRole("link")).toHaveTextContent(GITHUB_PROJECT_SLUG);

    rerender(<GitHubRepoLink variant="badge" href={GITHUB_PANEL_URL} label={GITHUB_PANEL_SLUG} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", GITHUB_PANEL_URL);
    expect(link).toHaveTextContent(GITHUB_PANEL_SLUG);
  });
});
