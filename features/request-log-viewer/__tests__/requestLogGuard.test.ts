import { describe, expect, test } from "vitest";
import {
  GUARD_KIND_REPLY_LOOP,
  GUARD_KIND_TOOL_LOOP,
  guardFilterChoices,
  guardFilterVisible,
  guardKindsOfFilter,
  isGuardFilterValue,
  loopStoppedExplanation,
  normalizeGuardKind,
  type GuardFilterValue,
} from "../requestLogGuard";

describe("the loop protection filter's query", () => {
  test.each<[GuardFilterValue, string[] | undefined]>([
    ["all", undefined],
    ["any", ["reply_loop", "tool_loop"]],
    ["reply_loop", ["reply_loop"]],
    ["tool_loop", ["tool_loop"]],
  ])("%s asks the backend for %j", (value, expected) => {
    expect(guardKindsOfFilter(value)).toEqual(expected);
  });

  test("the kinds are the strings the backend files requests under", () => {
    expect(GUARD_KIND_REPLY_LOOP).toBe("reply_loop");
    expect(GUARD_KIND_TOOL_LOOP).toBe("tool_loop");
  });

  test("only the four choices are values; anything else coming from a control is dropped", () => {
    for (const value of ["all", "any", "reply_loop", "tool_loop"]) {
      expect(isGuardFilterValue(value)).toBe(true);
    }
    for (const value of ["", "ALL", "loop", "reply_loop,tool_loop"]) {
      expect(isGuardFilterValue(value)).toBe(false);
    }
  });
});

describe("whether the filter is offered", () => {
  test("never on a backend without loop protection, whatever the facet says", () => {
    expect(guardFilterVisible(false, ["reply_loop"], "all")).toBe(false);
    expect(guardFilterVisible(false, [], "tool_loop")).toBe(false);
  });

  test("not while there is nothing to filter, so a tenant that never turned a check on has no dead control", () => {
    expect(guardFilterVisible(true, [], "all")).toBe(false);
    // A kind this panel does not know is not something the filter could select.
    expect(guardFilterVisible(true, ["something_new"], "all")).toBe(false);
  });

  test("once a kind exists", () => {
    expect(guardFilterVisible(true, ["reply_loop"], "all")).toBe(true);
    expect(guardFilterVisible(true, ["tool_loop"], "all")).toBe(true);
    expect(guardFilterVisible(true, ["reply_loop", "tool_loop"], "all")).toBe(true);
  });

  test("a choice already made keeps it on screen, even when the facet is empty, so it can be undone", () => {
    expect(guardFilterVisible(true, [], "tool_loop")).toBe(true);
    expect(guardFilterVisible(true, [], "any")).toBe(true);
  });
});

describe("the choices listed", () => {
  test("all requests, and one choice per kind the facet has", () => {
    expect(guardFilterChoices(["reply_loop"], "all")).toEqual(["all", "reply_loop"]);
    expect(guardFilterChoices(["tool_loop"], "all")).toEqual(["all", "tool_loop"]);
  });

  test("'any of them' only where two kinds make it differ from either", () => {
    expect(guardFilterChoices(["reply_loop", "tool_loop"], "all")).toEqual([
      "all",
      "any",
      "reply_loop",
      "tool_loop",
    ]);
  });

  test("the current choice is always listed, so the control never shows a value it cannot name", () => {
    expect(guardFilterChoices([], "tool_loop")).toEqual(["all", "tool_loop"]);
    expect(guardFilterChoices(["reply_loop"], "tool_loop")).toEqual([
      "all",
      "reply_loop",
      "tool_loop",
    ]);
    expect(guardFilterChoices(["reply_loop"], "any")).toEqual(["all", "reply_loop", "any"]);
  });

  test("a kind the panel does not know adds nothing", () => {
    expect(guardFilterChoices(["something_new"], "all")).toEqual(["all"]);
  });
});

describe("the status tag", () => {
  const t = (key: string) => key;

  test("each kind has its own explanation and an unknown one gets the general sentence", () => {
    expect(loopStoppedExplanation(t, "reply_loop")).toBe("request_logs.loop_stopped_reply");
    expect(loopStoppedExplanation(t, "tool_loop")).toBe("request_logs.loop_stopped_tool");
    expect(loopStoppedExplanation(t, "something_new")).toBe("request_logs.loop_stopped_other");
  });

  test("a kind from the backend is trimmed, kept when unknown, and empty when absent", () => {
    expect(normalizeGuardKind(" reply_loop ")).toBe("reply_loop");
    expect(normalizeGuardKind("something_new")).toBe("something_new");
    expect(normalizeGuardKind(undefined)).toBe("");
    expect(normalizeGuardKind(null)).toBe("");
    expect(normalizeGuardKind(7)).toBe("");
  });
});
