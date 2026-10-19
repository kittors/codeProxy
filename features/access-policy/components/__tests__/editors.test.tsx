import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@code-proxy/i18n";
import { emptyQuotaMatrix, type QuotaCellKey } from "@code-proxy/api-client";
import { emptyMatrixDraft, emptyRouteDraft, type ModelRouteDraft } from "../../model/policyDraft";
import { ModelPatternInput } from "../ModelPatternInput";
import { ModelRoutesEditor } from "../ModelRoutesEditor";
import { PolicyTester } from "../PolicyTester";
import { QuotaMatrixEditor } from "../QuotaMatrixEditor";
import { QuotaUsageCell } from "../QuotaUsageCell";
import { KeyPolicyModal } from "../KeyPolicyModal";

const CATALOG = [{ value: "claude-opus-4-5" }, { value: "claude-opus-4-1" }, { value: "claude-sonnet-4-5" }, { value: "gpt-5" }];

describe("access policy editors", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  test("the matrix shows usage, ceilings and unavailable cells, and edits one cell at a time", async () => {
    const onChange = vi.fn();
    const usage = emptyQuotaMatrix();
    usage.cost.day = 45;
    const ceiling = emptyQuotaMatrix();
    ceiling.requests.week = 900;
    const draft = emptyMatrixDraft();
    draft.cost.day = "50";
    render(
      <QuotaMatrixEditor
        value={draft}
        onChange={onChange}
        usage={usage}
        ceiling={ceiling}
        unavailableCells={new Map<QuotaCellKey, string>([["cost.lifetime", "Not part of a template"]])}
        idPrefix="m"
        label="Quota"
      />,
    );
    const group = screen.getByRole("group", { name: "Quota" });
    // 45 / 50 已超过 80%：提示变成警告色。
    expect(within(group).getByText("$45 used")).toHaveClass("text-amber-700");
    expect(within(group).getByText("≤ 900")).toBeInTheDocument();
    expect(within(group).getByLabelText("Spend · Total: Not part of a template")).toBeInTheDocument();

    await userEvent.type(within(group).getByRole("textbox", { name: "Tokens · Weekly" }), "5");
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ tokens: expect.objectContaining({ week: "5" }), cost: expect.objectContaining({ day: "50" }) }),
    );
  });

  test("model patterns become chips; wildcards preview how many models they match", async () => {
    function Harness() {
      const [value, setValue] = useState<string[]>([]);
      return <ModelPatternInput value={value} onChange={setValue} catalog={CATALOG} ariaLabel="Models" />;
    }
    render(<Harness />);
    const input = screen.getByRole("combobox", { name: "Models" });

    await userEvent.type(input, "claude-opus-*");
    expect(screen.getByRole("option", { name: /Add "claude-opus-\*"/ })).toHaveTextContent("matches 2 models");
    await userEvent.keyboard("{Enter}");
    expect(screen.getByText("claude-opus-*")).toBeInTheDocument();

    // 粘贴一串名字一次加多个，重复的忽略。
    await userEvent.click(input);
    await userEvent.paste("gpt-5, claude-opus-*  claude-sonnet-4-5");
    expect(screen.getByText("gpt-5")).toBeInTheDocument();
    expect(screen.getByText("claude-sonnet-4-5")).toBeInTheDocument();
    expect(screen.getAllByText("claude-opus-*")).toHaveLength(1);

    await userEvent.click(screen.getByRole("button", { name: "Remove gpt-5" }));
    expect(screen.queryByRole("button", { name: "Remove gpt-5" })).toBeNull();
    // 输入框为空时退格删掉最后一个标签。
    await userEvent.click(input);
    await userEvent.keyboard("{Backspace}");
    expect(screen.queryByRole("button", { name: "Remove claude-sonnet-4-5" })).toBeNull();
    expect(screen.getByRole("button", { name: "Remove claude-opus-*" })).toBeInTheDocument();
  });

  test("routes can be reordered because the first match wins", async () => {
    const first: ModelRouteDraft = { ...emptyRouteDraft(), from: ["claude-opus-*"], to: "claude-sonnet-4-5" };
    const second: ModelRouteDraft = { ...emptyRouteDraft(), from: ["gpt-5"], to: "gpt-4o" };
    const onChange = vi.fn();
    render(<ModelRoutesEditor value={[first, second]} onChange={onChange} catalog={CATALOG} idPrefix="r" />);

    expect(screen.getByRole("button", { name: "Move route 1 up" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Move route 2 up" }));
    expect(onChange).toHaveBeenCalledWith([second, first]);
  });

  test("the tester explains routing, the rules in force and the fallback", async () => {
    render(
      <PolicyTester
        routes={[{ from: ["gpt-5"], to: "claude-opus-4-5" }]}
        rules={[{ name: "Opus weekly", models: ["claude-opus-*"], fallback: "claude-sonnet-4-5" }]}
        catalog={CATALOG}
      />,
    );
    await userEvent.type(screen.getByRole("combobox", { name: "Model to try" }), "gpt-5");
    expect(screen.getByText("Rewritten to claude-opus-4-5 (route 1)")).toBeInTheDocument();
    expect(screen.getByText("Bound by these rules: Opus weekly")).toBeInTheDocument();
    expect(screen.getByText('Switches to claude-sonnet-4-5 once "Opus weekly" runs out')).toBeInTheDocument();
  });

  test("the list cell orders cells by how full they are and folds the rest", () => {
    const limits = emptyQuotaMatrix();
    limits.cost.day = 100;
    limits.requests.week = 1000;
    limits.tokens.month = 10_000_000;
    limits.cost.month = 1000;
    const usage = emptyQuotaMatrix();
    usage.cost.day = 10;
    usage.requests.week = 990;
    usage.tokens.month = 5_000_000;
    usage.cost.month = 100;
    // 四格放三格，最后一格让给「+N」。
    render(<QuotaUsageCell limits={limits} usage={usage} max={3} />);
    const cells = screen.getAllByText(/\//).map((node) => node.textContent);
    expect(cells).toEqual(["990 / 1,000", "5M / 10M"]);
    expect(screen.getByRole("button", { name: "2 more limits" })).toHaveTextContent("+2");
  });

  test("the key editor checks the account ceiling before submitting", async () => {
    const onSubmit = vi.fn();
    const ceiling = emptyQuotaMatrix();
    ceiling.cost.day = 50;
    render(
      <KeyPolicyModal
        open
        mode="create"
        ceiling={ceiling}
        capabilities={{ accessPolicy: true, modelFallback: true }}
        catalog={CATALOG}
        existingNames={["Taken"]}
        saving={false}
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />,
    );
    const dialog = screen.getByRole("dialog", { name: "Create key" });
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Name" }), "taken");
    await userEvent.click(within(dialog).getByRole("button", { name: "Create" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(within(dialog).getByText("That name is already taken")).toBeInTheDocument();

    const name = within(dialog).getByRole("textbox", { name: "Name" });
    await userEvent.clear(name);
    await userEvent.type(name, "worker");
    await userEvent.click(within(dialog).getByRole("tab", { name: /Quota/ }));
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Spend · Daily" }), "80");
    await userEvent.click(within(dialog).getByRole("button", { name: "Create" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(within(dialog).getByText("Can't exceed the account limit of $50")).toBeInTheDocument();

    const day = within(dialog).getByRole("textbox", { name: "Spend · Daily" });
    await userEvent.clear(day);
    await userEvent.type(day, "40");
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Tokens · Daily" }), "2M");
    await userEvent.click(within(dialog).getByRole("button", { name: "Create" }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "worker",
        rules: [],
        limits: expect.objectContaining({
          cost: expect.objectContaining({ day: 40 }),
          tokens: expect.objectContaining({ day: 2_000_000 }),
        }),
      }),
    );
  });
});
