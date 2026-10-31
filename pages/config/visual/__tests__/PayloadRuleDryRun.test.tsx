import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@code-proxy/i18n";
import type { PayloadRulesDryRunRequest, PayloadRulesDryRunResult } from "@code-proxy/api-client";
import { ThemeProvider } from "@code-proxy/ui";
import type { PayloadFilterRule, PayloadRule } from "@features/visual-config-editor";
import { PayloadRuleDryRun } from "@pages/config/visual/PayloadRuleDryRun";

const mocks = vi.hoisted(() => ({
  dryRun: vi.fn<(request: PayloadRulesDryRunRequest) => Promise<PayloadRulesDryRunResult>>(),
  can: vi.fn<(permission: string) => boolean>(() => true),
}));

vi.mock("@code-proxy/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@code-proxy/api-client")>();
  return { ...actual, payloadRulesApi: { dryRun: mocks.dryRun } };
});

vi.mock("@app/providers/AuthProvider", () => ({
  useOptionalAuth: () => ({ can: mocks.can }),
}));

function valueRule(id: string, names: string[], params: PayloadRule["params"]): PayloadRule {
  return { id, models: names.map((name, i) => ({ id: `${id}-m${i}`, name })), params };
}

// The first default rule lists no model: saving drops it, so the draft's rule 0 is the page's rule 2.
const VALUES = {
  payloadDefaultRules: [
    valueRule("d0", [""], [{ id: "p0", path: "x", valueType: "string", value: "y" }]),
    valueRule(
      "d1",
      ["gpt-*"],
      [{ id: "p1", path: "max_tokens", valueType: "number", value: "4096" }],
    ),
  ],
  payloadOverrideRules: [
    {
      id: "o0",
      models: [{ id: "o0-m0", name: "fast", protocol: "codex" }],
      params: [{ id: "p2", path: "service_tier", valueType: "string", value: "priority" }],
    } satisfies PayloadRule,
  ],
  payloadFilterRules: [
    {
      id: "f0",
      models: [{ id: "f0-m0", name: "*" }],
      params: ["stream_options"],
    } satisfies PayloadFilterRule,
  ],
};

const RESULT: PayloadRulesDryRunResult = {
  body: '{\n  "temperature": 1,\n  "max_tokens": 4096\n}',
  models: ["gpt-5", "fast", "fast(high)"],
  rules: [
    {
      section: "default",
      index: 0,
      matched: true,
      pattern: "gpt-*",
      model: "gpt-5",
      params: [{ path: "max_tokens", action: "set", value: "4096" }],
    },
    { section: "override", index: 0, matched: false, miss: "protocol" },
    {
      section: "filter",
      index: 0,
      matched: true,
      pattern: "*",
      model: "gpt-5",
      params: [{ path: "stream_options", action: "skipped", reason: "absent" }],
    },
  ],
  changes: [{ path: "max_tokens", after: "4096" }],
};

function renderTrial(values = VALUES) {
  return render(
    <ThemeProvider>
      <PayloadRuleDryRun values={values} />
    </ThemeProvider>,
  );
}

describe("PayloadRuleDryRun", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    mocks.dryRun.mockReset();
    mocks.can.mockReset();
    mocks.can.mockReturnValue(true);
  });

  test("checks the model and the sample body before running", async () => {
    renderTrial();
    await userEvent.click(screen.getByRole("button", { name: "Run" }));
    expect(
      screen.getByText("Enter the upstream model or the model the client asks for"),
    ).toBeVisible();
    expect(screen.getByText("Paste a request body")).toBeVisible();

    await userEvent.type(screen.getByRole("textbox", { name: "Upstream model" }), "gpt-5");
    await userEvent.click(screen.getByRole("textbox", { name: /Request body/ }));
    await userEvent.paste("[1]");
    await userEvent.click(screen.getByRole("button", { name: "Run" }));
    expect(screen.getByText("The request body must be a JSON object")).toBeVisible();
    expect(mocks.dryRun).not.toHaveBeenCalled();
  });

  test("sends the page's rules as a draft and explains the result", async () => {
    mocks.dryRun.mockResolvedValue(RESULT);
    renderTrial();

    await userEvent.type(screen.getByRole("textbox", { name: "Upstream model" }), "gpt-5");
    await userEvent.type(
      screen.getByRole("textbox", { name: /Model the client asks for/ }),
      "fast(high)",
    );
    await userEvent.click(screen.getByRole("combobox", { name: "Protocol" }));
    await userEvent.click(await screen.findByRole("option", { name: "Codex" }));
    // userEvent.type reads "{" as a key descriptor; paste the text instead.
    await userEvent.click(screen.getByRole("textbox", { name: /Request body/ }));
    await userEvent.paste('{"temperature":1}');
    await userEvent.click(screen.getByRole("button", { name: "Run" }));

    expect(mocks.dryRun).toHaveBeenCalledWith({
      model: "gpt-5",
      "requested-model": "fast(high)",
      protocol: "codex",
      body: '{"temperature":1}',
      rules: {
        default: [{ models: [{ name: "gpt-*" }], params: { max_tokens: 4096 } }],
        override: [
          { models: [{ name: "fast", protocol: "codex" }], params: { service_tier: "priority" } },
        ],
        filter: [{ models: [{ name: "*" }], params: ["stream_options"] }],
      },
    });

    expect(await screen.findByRole("heading", { name: "1 change" })).toBeVisible();
    const row = screen.getByRole("row", { name: /max_tokens/ });
    expect(within(row).getByText("(absent)")).toBeVisible();
    expect(within(row).getByText("4096")).toBeVisible();
    // The draft's first default rule is the second one on the page.
    expect(screen.getByText("Fill in missing parameters · rule 2")).toBeVisible();
    expect(screen.getByText("Matched: gpt-* fits gpt-5")).toBeVisible();
    expect(screen.getByText("Not matched: limited to another protocol")).toBeVisible();
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === "LI" &&
          /^Skipped\s+stream_options\s+\(the request does not have it\)$/.test(
            element.textContent ?? "",
          ),
      ),
    ).toBeVisible();
    expect(screen.getByText("Matched against, in order: gpt-5 → fast → fast(high)")).toBeVisible();
  });

  test("says when the rules changed after the run", async () => {
    mocks.dryRun.mockResolvedValue({ ...RESULT, changes: [] });
    const view = renderTrial();
    await userEvent.type(screen.getByRole("textbox", { name: "Upstream model" }), "gpt-5");
    await userEvent.click(screen.getByRole("textbox", { name: /Request body/ }));
    await userEvent.paste("{}");
    await userEvent.click(screen.getByRole("button", { name: "Run" }));
    expect(
      await screen.findByRole("heading", { name: "The rules do not change this body" }),
    ).toBeVisible();
    expect(screen.queryByText(/The rules changed after this run/)).toBeNull();

    view.rerender(
      <ThemeProvider>
        <PayloadRuleDryRun values={{ ...VALUES, payloadFilterRules: [] }} />
      </ThemeProvider>,
    );
    expect(screen.getByText(/The rules changed after this run/)).toBeVisible();
  });

  test("shows what the backend rejected", async () => {
    mocks.dryRun.mockRejectedValue(new Error("rules.default: cannot unmarshal"));
    renderTrial();
    await userEvent.type(screen.getByRole("textbox", { name: "Upstream model" }), "gpt-5");
    await userEvent.click(screen.getByRole("textbox", { name: /Request body/ }));
    await userEvent.paste("{}");
    await userEvent.click(screen.getByRole("button", { name: "Run" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("rules.default: cannot unmarshal");
  });

  test("cannot run without permission to save the rules", () => {
    mocks.can.mockReturnValue(false);
    renderTrial();
    expect(screen.getByRole("button", { name: "Run" })).toBeDisabled();
    expect(screen.getByText(/needs permission to write the system configuration/)).toBeVisible();
    expect(mocks.can).toHaveBeenCalledWith("system.config.write");
  });
});
