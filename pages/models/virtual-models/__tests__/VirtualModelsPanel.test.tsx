import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@code-proxy/i18n";
import { ThemeProvider, ToastProvider } from "@code-proxy/ui";
import type { RoutingVirtualModel } from "@code-proxy/api-client";
import { ApiClientError } from "@code-proxy/api-client/client/errors";
import { VirtualModelsPanel } from "../VirtualModelsPanel";

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  listGroups: vi.fn(),
  getVirtualModels: vi.fn(),
  updateVirtualModels: vi.fn(),
}));

vi.mock("@code-proxy/api-client", async () => {
  // The real error helpers, so a 409 is recognized the way the panel sees it in production.
  const errors = await vi.importActual<typeof import("@code-proxy/api-client/client/errors")>(
    "@code-proxy/api-client/client/errors",
  );
  return {
    apiClient: { get: mocks.apiGet },
    channelGroupsApi: { list: mocks.listGroups },
    routingVirtualModelsApi: { get: mocks.getVirtualModels, update: mocks.updateVirtualModels },
    isApiClientError: errors.isApiClientError,
    extractApiErrorCode: errors.extractApiErrorCode,
  };
});

const smart: RoutingVirtualModel = {
  name: "smart",
  description: "GPT first, Claude when busy",
  strategy: "weighted",
  members: [
    { group: "team", model: "gpt-5", weight: 3 },
    { model: "claude-opus-4", weight: 1 },
  ],
};

function renderPanel() {
  return render(
    <ThemeProvider>
      <ToastProvider>
        <VirtualModelsPanel />
      </ToastProvider>
    </ThemeProvider>,
  );
}

/** Picks a model the backend listed, or types one it did not. */
async function chooseModel(user: ReturnType<typeof userEvent.setup>, index: number, model: string) {
  const name = `Model of member ${index}`;
  await user.click(screen.getByRole("combobox", { name }));
  // The previous member's list can still be animating out, so look only in this member's list.
  const listbox = within(screen.getByRole("listbox", { name }));
  await user.type(listbox.getByPlaceholderText("Search models"), model);
  const listed = listbox.queryByRole("option", { name: model });
  await user.click(listed ?? listbox.getByRole("option", { name: `Use ${model}` }));
}

describe("VirtualModelsPanel", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    mocks.apiGet.mockImplementation((path: string) =>
      path === "/models"
        ? Promise.resolve({ data: [{ id: "gpt-5" }, { id: "claude-opus-4" }] })
        : Promise.reject(new Error(`unexpected GET ${path}`)),
    );
    mocks.listGroups.mockResolvedValue([{ name: "Team" }, { name: "backup" }]);
    mocks.getVirtualModels.mockResolvedValue({ virtualModels: [smart], version: 7 });
    mocks.updateVirtualModels.mockResolvedValue({ status: "ok" });
  });

  test("lists each virtual model with its members in the order they are tried", async () => {
    renderPanel();
    const row = (await screen.findByText("smart")).closest("tr");
    expect(row).not.toBeNull();
    const cells = within(row as HTMLElement);
    expect(cells.getByText("GPT first, Claude when busy")).toBeInTheDocument();
    expect(cells.getByText("team/gpt-5")).toBeInTheDocument();
    expect(cells.getByText("claude-opus-4")).toBeInTheDocument();
    expect(cells.getByText("· 3")).toBeInTheDocument();
    expect(cells.getByText("By weight")).toBeInTheDocument();
  });

  test("an empty list explains what a virtual model is", async () => {
    mocks.getVirtualModels.mockResolvedValue({ virtualModels: [], version: 0 });
    renderPanel();
    expect(await screen.findByText("No virtual models yet")).toBeInTheDocument();
  });

  test("adds a virtual model at the version it read", async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText("smart");
    await user.click(screen.getAllByRole("button", { name: "Add virtual model" })[0]);

    const dialog = await screen.findByRole("dialog");
    // Saving an empty draft points at what is missing and sends nothing.
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(within(dialog).getByText("Enter a name.")).toBeInTheDocument();
    expect(within(dialog).getByText("Member 1: choose a model.")).toBeInTheDocument();
    expect(mocks.updateVirtualModels).not.toHaveBeenCalled();

    await user.type(within(dialog).getByRole("textbox", { name: /^Name/ }), "fast");
    expect(within(dialog).getByText("1/16 members")).toBeInTheDocument();
    await chooseModel(user, 1, "gpt-5-mini");
    // A typed model is not in the list the backend sent, and still shows as chosen.
    expect(within(dialog).getByRole("combobox", { name: "Model of member 1" })).toHaveTextContent(
      "gpt-5-mini",
    );
    await user.click(within(dialog).getByRole("button", { name: "Add member" }));
    expect(within(dialog).getByText("2/16 members")).toBeInTheDocument();
    await chooseModel(user, 2, "gpt-5");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mocks.updateVirtualModels).toHaveBeenCalledTimes(1));
    expect(mocks.updateVirtualModels).toHaveBeenCalledWith(
      [smart, { name: "fast", members: [{ model: "gpt-5-mini" }, { model: "gpt-5" }] }],
      7,
    );
    expect(await screen.findByText("Virtual model saved")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    // Read again for the new version.
    expect(mocks.getVirtualModels).toHaveBeenCalledTimes(2);
  });

  test("a name another virtual model has is refused before saving", async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText("smart");
    await user.click(screen.getAllByRole("button", { name: "Add virtual model" })[0]);
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByRole("textbox", { name: /^Name/ }), "SMART");
    await chooseModel(user, 1, "gpt-5");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(within(dialog).getByText("Another virtual model already has this name.")).toBeInTheDocument();
    expect(mocks.updateVirtualModels).not.toHaveBeenCalled();
  });

  test("a concurrent change reloads the list and keeps the edit open", async () => {
    const user = userEvent.setup();
    mocks.updateVirtualModels.mockRejectedValueOnce(
      new ApiClientError({
        message: "routing config was changed by someone else",
        status: 409,
        payload: { error: { code: "config_version_conflict", message: "version 7 is stale" } },
      }),
    );
    renderPanel();
    await screen.findByText("smart");
    await user.click(screen.getByRole("button", { name: "Edit smart" }));
    const dialog = await screen.findByRole("dialog");
    const name = within(dialog).getByRole("textbox", { name: /^Name/ });
    expect(name).toHaveValue("smart");
    expect(within(dialog).getByRole("textbox", { name: "Weight of member 1" })).toHaveValue("3");
    await user.clear(name);
    await user.type(name, "clever");

    mocks.getVirtualModels.mockResolvedValue({ virtualModels: [smart], version: 8 });
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(
      await screen.findByText(/The virtual models were changed while you were editing/),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(within(screen.getByRole("dialog")).getByRole("textbox", { name: /^Name/ })).toHaveValue(
      "clever",
    );

    // Saving again applies the edit on top of the list it reloaded.
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mocks.updateVirtualModels).toHaveBeenCalledTimes(2));
    expect(mocks.updateVirtualModels).toHaveBeenLastCalledWith([{ ...smart, name: "clever" }], 8);
  });

  test("editing shows a member's model even when the model list no longer has it", async () => {
    const user = userEvent.setup();
    mocks.getVirtualModels.mockResolvedValue({
      virtualModels: [{ name: "legacy", members: [{ model: "retired-model" }] }],
      version: 7,
    });
    renderPanel();
    await screen.findByText("legacy");
    await user.click(screen.getByRole("button", { name: "Edit legacy" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("combobox", { name: "Model of member 1" })).toHaveTextContent(
      "retired-model",
    );
  });

  test("deletes only after confirming", async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText("smart");
    await user.click(screen.getByRole("button", { name: "Delete smart" }));
    const confirm = await screen.findByRole("dialog");
    expect(confirm).toHaveTextContent("Requests for smart will then fail");
    await user.click(within(confirm).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(mocks.updateVirtualModels).toHaveBeenCalledWith([], 7));
    expect(await screen.findByText("Virtual model deleted")).toBeInTheDocument();
  });
});
