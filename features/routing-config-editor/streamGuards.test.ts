import { describe, expect, test } from "vitest";
import { NO_ROUTING_CONFIG_SUPPORT } from "@code-proxy/api-client/endpoints/routing-config";
import {
  emptyStreamGuardsDraft,
  isValidBusyWaitMax,
  isValidFirstTokenTimeout,
  streamGuardsError,
  streamGuardsFromEntry,
  streamGuardsToEntry,
} from "./streamGuards";

const SUPPORTED = {
  ...NO_ROUTING_CONFIG_SUPPORT,
  channelGroupFirstTokenTimeout: true,
  channelGroupBusyWait: true,
};

describe("stream guards draft", () => {
  test("round-trips what was stored, keeping a busy wait of 0 apart from unset", () => {
    for (const stored of [
      {},
      { firstTokenTimeoutSeconds: 30 },
      { busyWaitMaxSeconds: 0 },
      { firstTokenTimeoutSeconds: 300, busyWaitMaxSeconds: 240 },
    ]) {
      expect(streamGuardsToEntry(streamGuardsFromEntry(stored))).toEqual({
        firstTokenTimeoutSeconds: undefined,
        busyWaitMaxSeconds: undefined,
        ...stored,
      });
    }
  });

  test("stores a timeout of 0 as off, which is what the backend reads", () => {
    expect(streamGuardsToEntry({ firstTokenTimeout: "0", busyWaitMax: "" })).toEqual({
      firstTokenTimeoutSeconds: undefined,
      busyWaitMaxSeconds: undefined,
    });
    expect(streamGuardsToEntry({ firstTokenTimeout: " 45 ", busyWaitMax: " 0 " })).toEqual({
      firstTokenTimeoutSeconds: 45,
      busyWaitMaxSeconds: 0,
    });
  });

  // The same bounds as CliRelay's ValidateStreamGuards, edges included.
  test.each<[number | undefined, boolean]>([
    [undefined, true],
    [0, true],
    [4, false],
    [5, true],
    [300, true],
    [301, false],
  ])("first-token timeout %s valid: %s", (seconds, valid) => {
    expect(isValidFirstTokenTimeout(seconds)).toBe(valid);
  });

  test.each<[number | undefined, boolean]>([
    [undefined, true],
    [0, true],
    [240, true],
    [241, false],
    [-1, false],
  ])("busy wait %s valid: %s", (seconds, valid) => {
    expect(isValidBusyWaitMax(seconds)).toBe(valid);
  });

  test("reports the first invalid field the backend advertises", () => {
    expect(streamGuardsError(emptyStreamGuardsDraft(), SUPPORTED)).toBe("");
    expect(streamGuardsError({ firstTokenTimeout: "3", busyWaitMax: "999" }, SUPPORTED)).toBe(
      "channel_groups_page.first_token_timeout_invalid",
    );
    expect(streamGuardsError({ firstTokenTimeout: "", busyWaitMax: "999" }, SUPPORTED)).toBe(
      "channel_groups_page.busy_wait_invalid",
    );
    expect(streamGuardsError({ firstTokenTimeout: "1.5", busyWaitMax: "" }, SUPPORTED)).toBe(
      "channel_groups_page.first_token_timeout_invalid",
    );
  });

  // A hidden field cannot be corrected, so it cannot block the save either.
  test("does not check fields the backend does not advertise", () => {
    expect(
      streamGuardsError({ firstTokenTimeout: "3", busyWaitMax: "999" }, NO_ROUTING_CONFIG_SUPPORT),
    ).toBe("");
  });
});
