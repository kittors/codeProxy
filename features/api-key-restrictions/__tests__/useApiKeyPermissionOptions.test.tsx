import { isValidElement, type ReactElement } from "react";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@code-proxy/i18n";
import { useApiKeyPermissionOptions } from "../useApiKeyPermissionOptions";

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  getVirtualModels: vi.fn(),
}));

vi.mock("@code-proxy/api-client", () => ({
  apiClient: { get: mocks.apiGet },
  routingVirtualModelsApi: { get: mocks.getVirtualModels },
  authFilesApi: {},
  providersApi: {},
}));

const labels = (options: Array<{ label: string }>) => options.map((option) => option.label);
/** The text tag an option shows in front of its name, if any. */
const tagOf = (option: { icon?: unknown }) =>
  isValidElement(option.icon)
    ? (option.icon as ReactElement<{ children?: unknown }>).props.children
    : undefined;

describe("useApiKeyPermissionOptions model options", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    mocks.apiGet.mockResolvedValue({ data: [{ id: "gpt-5" }, { id: "claude-opus-4" }] });
    mocks.getVirtualModels.mockResolvedValue({
      version: 3,
      virtualModels: [
        { name: "smart", members: [{ group: "team", model: "gpt-5" }, { model: "claude-opus-4" }] },
        { name: "team-only", members: [{ group: "Team", model: "gpt-5" }] },
        // Adds fallbacks to the real model of the same name.
        { name: "gpt-5", members: [{ model: "gpt-5" }, { group: "backup", model: "gpt-5" }] },
      ],
    });
  });

  test("lists the tenant's virtual models among the models a key may allow", async () => {
    const { result } = renderHook(() => useApiKeyPermissionOptions());
    const options = await result.current.fetchModelOptions();
    expect(labels(options)).toEqual(["claude-opus-4", "gpt-5", "smart", "team-only"]);
    // A virtual model with a real model's name is listed once, as the virtual model.
    expect(labels(options.filter((option) => tagOf(option) === "Virtual"))).toEqual([
      "gpt-5",
      "smart",
      "team-only",
    ]);
  });

  test("keeps only the virtual models a member of which the key's groups can run", async () => {
    const { result } = renderHook(() => useApiKeyPermissionOptions());
    const options = await result.current.fetchModelOptions([], ["backup"]);
    expect(mocks.apiGet).toHaveBeenCalledWith("/models?allowed_channel_groups=backup");
    // smart has a member with no group, which runs where the key runs; team-only does not.
    expect(labels(options)).toEqual(["claude-opus-4", "gpt-5", "smart"]);
  });

  test("an older backend without virtual models leaves the real models", async () => {
    mocks.getVirtualModels.mockRejectedValue(new Error("404 page not found"));
    const { result } = renderHook(() => useApiKeyPermissionOptions());
    expect(labels(await result.current.fetchModelOptions())).toEqual(["claude-opus-4", "gpt-5"]);
  });
});
