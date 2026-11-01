import { describe, expect, test } from "vitest";
import type { RoutingVirtualModel } from "@code-proxy/api-client";
import {
  applyDraft,
  checkDraft,
  emptyMemberDraft,
  firstPickShares,
  fromDraft,
  hasDraftIssues,
  memberRoute,
  removeVirtualModel,
  toDraft,
  type VirtualModelDraft,
} from "../virtualModelDrafts";

const groups = new Set(["team", "backup"]);

const smart: RoutingVirtualModel = {
  name: "smart",
  description: "GPT first",
  members: [{ group: "team", model: "gpt-5" }, { model: "claude-opus-4" }],
};

function draftOf(patch: Partial<VirtualModelDraft>, members: Array<[string, string, string?]>) {
  return {
    ...toDraft(),
    ...patch,
    members: members.map(([group, model, weight]) => ({
      ...emptyMemberDraft(group),
      model,
      weight: weight ?? "",
    })),
  };
}

describe("virtual model drafts", () => {
  test("round-trips a virtual model, lowercasing groups and dropping weights when in order", () => {
    const draft = toDraft({
      name: "smart",
      strategy: "weighted",
      members: [
        { group: "team", model: "gpt-5", weight: 3 },
        { model: "claude-opus-4", weight: 0 },
      ],
    });
    expect(draft.weighted).toBe(true);
    expect(draft.members.map((member) => member.weight)).toEqual(["3", ""]);

    expect(fromDraft({ ...draft, members: [{ ...draft.members[0], group: " TEAM " }] })).toEqual({
      name: "smart",
      strategy: "weighted",
      members: [{ group: "team", model: "gpt-5", weight: 3 }],
    });
    // In order, the weights are not saved and the strategy is left out.
    expect(fromDraft({ ...draft, weighted: false })).toEqual({
      name: "smart",
      members: [{ group: "team", model: "gpt-5" }, { model: "claude-opus-4" }],
    });
  });

  test("replaces an edited virtual model in place, appends a new one and removes by name", () => {
    const fast: RoutingVirtualModel = { name: "fast", members: [{ model: "gpt-5-mini" }] };
    const renamed = { ...toDraft(smart), name: "clever" };
    expect(applyDraft([smart, fast], renamed).map((vm) => vm.name)).toEqual(["clever", "fast"]);
    expect(
      applyDraft([fast], draftOf({ name: "new" }, [["", "gpt-5"]])).map((vm) => vm.name),
    ).toEqual(["fast", "new"]);
    expect(removeVirtualModel([smart, fast], "SMART")).toEqual([fast]);
    expect(memberRoute(smart.members[0])).toBe("team/gpt-5");
    expect(memberRoute(smart.members[1])).toBe("claude-opus-4");
  });

  test("checks the name as the backend does", () => {
    const issue = (name: string, others: RoutingVirtualModel[] = []) =>
      checkDraft(draftOf({ name }, [["", "gpt-5"]]), others, groups).name;
    expect(issue("")).toBe("required");
    expect(issue("x".repeat(129))).toBe("too_long");
    expect(issue("team/smart")).toBe("slash");
    expect(issue("Auto")).toBe("reserved");
    expect(issue("my model")).toBe("not_printable");
    expect(issue("模型")).toBe("not_printable");
    expect(issue("SMART", [smart])).toBe("duplicate");
    expect(issue("smart")).toBeNull();
  });

  test("checks each member and the member list", () => {
    const check = (draft: VirtualModelDraft, others: RoutingVirtualModel[] = []) => {
      const issues = checkDraft(draft, others, groups);
      return {
        members: issues.members,
        member: draft.members.map((member) => issues.member[member.id] ?? null),
      };
    };
    expect(
      check(
        draftOf({ name: "vm" }, [
          ["", ""],
          ["", "bad model"],
          ["team", "backup/gpt-5"],
          ["", "smart"],
          ["gone", "gpt-5"],
          ["team", "gpt-5"],
          ["TEAM", "GPT-5"],
          // A group's own prefix on the model is allowed: it names the same route.
          ["backup", "backup/gpt-5"],
        ]),
        [smart],
      ),
    ).toEqual({
      members: null,
      member: [
        "model_required",
        "model_not_printable",
        "other_group_prefix",
        "nested",
        "unknown_group",
        null,
        "duplicate",
        null,
      ],
    });
    // A member with the virtual model's own name adds fallbacks to that real model.
    expect(
      check(
        draftOf({ name: "gpt-5" }, [
          ["", "gpt-5"],
          ["team", "gpt-5"],
        ]),
      ).member,
    ).toEqual([null, null]);
    expect(check(draftOf({ name: "vm" }, [])).members).toBe("none");
    expect(
      check(
        draftOf(
          { name: "vm" },
          Array.from({ length: 17 }, (_, i) => ["", `m-${i}`]),
        ),
      ).members,
    ).toBe("too_many");
  });

  test("needs a weight above zero when picking by weight, within 0–1000", () => {
    const weighted = (members: Array<[string, string, string?]>) =>
      checkDraft(draftOf({ name: "vm", weighted: true }, members), [], groups);
    expect(
      weighted([
        ["", "a", "0"],
        ["", "b"],
      ]).members,
    ).toBe("no_weight");
    const tooHeavy = draftOf({ name: "vm", weighted: true }, [
      ["", "a", "1001"],
      ["", "b", "1"],
    ]);
    expect(checkDraft(tooHeavy, [], groups).member).toEqual({
      [tooHeavy.members[0].id]: "weight_range",
    });
    expect(
      hasDraftIssues(
        weighted([
          ["", "a", "1000"],
          ["", "b", "0"],
        ]),
      ),
    ).toBe(false);
  });

  test("shows each member's chance of being tried first", () => {
    const draft = draftOf({ name: "vm", weighted: true }, [
      ["", "a", "3"],
      ["", "b", "1"],
      ["", "c", ""],
    ]);
    expect(Object.values(firstPickShares(draft))).toEqual([75, 25, 0]);
    expect(firstPickShares({ ...draft, weighted: false })).toEqual({});
    expect(firstPickShares(draftOf({ name: "vm", weighted: true }, [["", "a", "0"]]))).toEqual({});
  });
});
