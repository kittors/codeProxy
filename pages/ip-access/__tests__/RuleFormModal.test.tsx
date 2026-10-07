import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { IpAccessRule } from "@code-proxy/api-client";
import i18n from "@code-proxy/i18n";
import { RuleEditModal } from "../RuleEditModal";
import { RuleFormModal } from "../RuleFormModal";

const createRule = vi.fn();
const updateRule = vi.fn();
const notify = vi.fn();

vi.mock("@code-proxy/api-client", () => ({
  ipAccessApi: {
    createRule: (...args: unknown[]) => createRule(...args),
    updateRule: (...args: unknown[]) => updateRule(...args),
  },
}));

vi.mock("@code-proxy/ui", async () => {
  const actual = await vi.importActual<typeof import("@code-proxy/ui")>("@code-proxy/ui");
  return { ...actual, useToast: () => ({ notify }) };
});

const rule: IpAccessRule = {
  id: "r1",
  cidr: "203.0.113.66/32",
  family: 4,
  effect: "deny",
  source: "auto",
  reason: "repeated failures",
  note: "",
  enabled: true,
  expires_at: null,
  created_at: "2026-08-11T00:00:00Z",
  updated_at: "2026-08-11T00:00:00Z",
  hit_count: 3,
  last_hit_at: null,
};

describe("RuleFormModal", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    createRule.mockReset();
    updateRule.mockReset();
    notify.mockReset();
  });

  test("checks the address in place and previews what will be saved", async () => {
    const user = userEvent.setup();
    render(
      <RuleFormModal open preset={null} onClose={() => undefined} onCreated={() => undefined} />,
    );

    const dialog = screen.getByRole("dialog", { name: "Add rule" });
    const cidr = within(dialog).getByRole("textbox", { name: "Address / CIDR" });
    await user.type(cidr, "203.0.113.999");
    await user.tab();
    expect(cidr).toHaveAttribute("aria-invalid", "true");
    expect(cidr).toHaveAccessibleDescription(/Enter an IP or CIDR/);

    await user.clear(cidr);
    await user.type(cidr, "203.0.113.0/24");
    expect(cidr).toHaveAccessibleDescription("IPv4 range, 256 addresses");
    await user.clear(cidr);
    await user.type(cidr, "203.0.113.10");
    expect(cidr).toHaveAccessibleDescription("Single IPv4 address, saved as 203.0.113.10/32");
    expect(createRule).not.toHaveBeenCalled();
  });

  test("creates an allow rule with a temporary duration", async () => {
    const user = userEvent.setup();
    createRule.mockResolvedValue({ rule });
    const onCreated = vi.fn();
    render(<RuleFormModal open preset={null} onClose={() => undefined} onCreated={onCreated} />);

    const dialog = screen.getByRole("dialog", { name: "Add rule" });
    await user.type(
      within(dialog).getByRole("textbox", { name: "Address / CIDR" }),
      "198.51.100.7",
    );
    await user.click(within(dialog).getByRole("radio", { name: /^Allow/ }));
    await user.click(within(dialog).getByRole("radio", { name: "1 hour" }));
    await user.click(within(dialog).getByRole("button", { name: "Add rule" }));

    await waitFor(() =>
      expect(createRule).toHaveBeenCalledWith(
        expect.objectContaining({
          cidr: "198.51.100.7",
          effect: "allow",
          expires_at: expect.any(String),
        }),
      ),
    );
    expect(onCreated).toHaveBeenCalled();
  });

  test("keeps a server rejection inside the dialog", async () => {
    const user = userEvent.setup();
    createRule.mockRejectedValue(new Error("address is protected"));
    render(
      <RuleFormModal open preset={null} onClose={() => undefined} onCreated={() => undefined} />,
    );

    const dialog = screen.getByRole("dialog", { name: "Add rule" });
    await user.type(within(dialog).getByRole("textbox", { name: "Address / CIDR" }), "127.0.0.1");
    await user.click(within(dialog).getByRole("button", { name: "Add rule" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("address is protected");
    expect(notify).not.toHaveBeenCalledWith(expect.objectContaining({ type: "error" }));
  });
});

describe("RuleEditModal", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  test("shows the fixed fields read-only and previews the new expiry", async () => {
    const user = userEvent.setup();
    render(<RuleEditModal rule={rule} onClose={() => undefined} onSaved={() => undefined} />);

    const dialog = screen.getByRole("dialog", { name: "Edit rule" });
    expect(within(dialog).getByText("203.0.113.66/32")).toBeInTheDocument();
    expect(within(dialog).getByText(/cannot be changed/)).toBeInTheDocument();
    const duration = within(dialog).getByRole("combobox", { name: "Duration" });
    expect(duration).toHaveAccessibleDescription("Currently: never expires");

    await user.click(duration);
    await user.click(screen.getByRole("option", { name: "Permanent" }));
    expect(within(dialog).getByRole("combobox", { name: "Duration" })).toHaveAccessibleDescription(
      "Never expires",
    );
  });
});
