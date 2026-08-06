import { afterEach, describe, expect, test, vi } from "vitest";
import { AuthBroadcast, type AuthBroadcastMessage } from "../auth-broadcast";

// Node's BroadcastChannel is worker_threads-backed, not an in-process event bus:
// a single instance never receives its own posts, so every test that wants to
// observe a message must build two explicit peers on the same channel name.
describe("AuthBroadcast", () => {
  const opened: AuthBroadcast[] = [];

  const create = (name: string): AuthBroadcast => {
    const channel = new AuthBroadcast(name);
    opened.push(channel);
    return channel;
  };

  afterEach(() => {
    for (const channel of opened.splice(0)) channel.close();
    vi.unstubAllGlobals();
  });

  test("a peer receives a published message; the publisher does not receive its own", async () => {
    const a = create("auth-broadcast-basic");
    const b = create("auth-broadcast-basic");
    const receivedByA: AuthBroadcastMessage[] = [];
    const receivedByB: AuthBroadcastMessage[] = [];
    a.subscribe((message) => receivedByA.push(message));
    b.subscribe((message) => receivedByB.push(message));

    a.publish({ type: "token-rotated", rotationSeq: 2, accountId: "acct-1" });

    await vi.waitFor(() => expect(receivedByB).toHaveLength(1));
    expect(receivedByB[0]).toEqual({
      type: "token-rotated",
      rotationSeq: 2,
      accountId: "acct-1",
    });
    // Give any (incorrect) self-delivery a chance to arrive before asserting absence.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(receivedByA).toHaveLength(0);
  });

  test("signed-out messages propagate to peers with their code intact", async () => {
    const a = create("auth-broadcast-signed-out");
    const b = create("auth-broadcast-signed-out");
    const receivedByB: AuthBroadcastMessage[] = [];
    b.subscribe((message) => receivedByB.push(message));

    a.publish({ type: "signed-out", code: "user_logout" });

    await vi.waitFor(() => expect(receivedByB).toHaveLength(1));
    expect(receivedByB[0]).toEqual({ type: "signed-out", code: "user_logout" });
  });

  test("degrades to a no-op when BroadcastChannel is unavailable", () => {
    vi.stubGlobal("BroadcastChannel", undefined);

    expect(() => {
      const channel = new AuthBroadcast("auth-broadcast-missing-api");
      const unsubscribe = channel.subscribe(() => undefined);
      channel.publish({ type: "signed-out", code: "user_logout" });
      unsubscribe();
      channel.close();
    }).not.toThrow();
  });

  // D16 anchor: the wire payload must never carry token material, even if a
  // caller widens the literal type and slips extra fields onto it.
  test("a token-rotated message never carries token fields on the wire", async () => {
    const a = create("auth-broadcast-no-token-leak");
    const b = create("auth-broadcast-no-token-leak");
    const received: unknown[] = [];
    b.subscribe((message) => received.push(message));

    const leaky = {
      type: "token-rotated",
      rotationSeq: 4,
      accountId: "acct-9",
      accessToken: "cps_should_never_leak",
      refreshToken: "cpr_adm_should_never_leak",
    } as unknown as AuthBroadcastMessage;
    a.publish(leaky);

    await vi.waitFor(() => expect(received).toHaveLength(1));
    expect(received[0]).toEqual({ type: "token-rotated", rotationSeq: 4, accountId: "acct-9" });
    // The "token-rotated" discriminator itself contains the substring "token",
    // so assert on the actual secret material and the field names that would
    // carry it rather than a blanket /token/i match.
    const serialized = JSON.stringify(received[0]);
    expect(serialized).not.toContain("cps_should_never_leak");
    expect(serialized).not.toContain("cpr_adm_should_never_leak");
    expect(serialized).not.toContain("accessToken");
    expect(serialized).not.toContain("refreshToken");
  });
});
