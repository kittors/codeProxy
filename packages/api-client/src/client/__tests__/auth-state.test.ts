import { describe, expect, test } from "vitest";
import {
  AUTH_NOT_CONFIGURED,
  AUTH_SUSPENDED,
  AuthGate,
  type AuthRequirement,
} from "../auth-state";
import { ApiError } from "../errors";

const captureThrow = (gate: AuthGate, requirement: AuthRequirement): ApiError => {
  try {
    gate.assertCanSend(requirement);
  } catch (error) {
    return error as ApiError;
  }
  throw new Error("expected assertCanSend to throw");
};

describe("AuthGate", () => {
  test("starts anonymous and short-circuits authenticated requests without an auth error", () => {
    const gate = new AuthGate();
    expect(gate.getState()).toBe("anonymous");
    expect(gate.isUsable()).toBe(false);

    const error = captureThrow(gate, "required");
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(0);
    // Must stay false: a caller that suspends on this error would make the gate
    // produce it forever.
    expect(error.isAuthError).toBe(false);
    expect(error.payload).toEqual({ code: AUTH_NOT_CONFIGURED });
  });

  test("anonymous requests pass in every state", () => {
    const gate = new AuthGate();
    expect(() => gate.assertCanSend("anonymous")).not.toThrow();
    gate.configure({ managementKey: "cps_key" });
    expect(() => gate.assertCanSend("anonymous")).not.toThrow();
    gate.suspend();
    expect(() => gate.assertCanSend("anonymous")).not.toThrow();
  });

  test("configuring a credential opens the gate", () => {
    const gate = new AuthGate();
    gate.configure({ managementKey: "  cps_key  ", refreshToken: "cpr_adm_r1" });
    expect(gate.getState()).toBe("active");
    expect(gate.isUsable()).toBe(true);
    expect(gate.hasRefreshToken()).toBe(true);
    expect(() => gate.assertCanSend("required")).not.toThrow();
  });

  test("suspend is idempotent and reports only the transition", () => {
    const gate = new AuthGate();
    gate.configure({ managementKey: "cps_key" });
    expect(gate.suspend()).toBe(true);
    expect(gate.suspend()).toBe(false);
    expect(gate.getState()).toBe("suspended");

    const error = captureThrow(gate, "required");
    expect(error.status).toBe(401);
    expect(error.isAuthError).toBe(true);
    expect(error.payload).toEqual({ code: AUTH_SUSPENDED });
  });

  // F6: clearing the credential on a suspended gate must not re-open it.
  test("clearing the credential leaves a suspended gate shut, not active", () => {
    const gate = new AuthGate();
    gate.configure({ managementKey: "cps_key" });
    gate.suspend();

    gate.configure({ managementKey: "", refreshToken: null });

    expect(gate.getState()).toBe("anonymous");
    expect(gate.isUsable()).toBe(false);
    expect(gate.hasRefreshToken()).toBe(false);
  });

  test("signing in again on a suspended gate restores it", () => {
    const gate = new AuthGate();
    gate.configure({ managementKey: "cps_old" });
    gate.suspend();

    gate.configure({ managementKey: "cps_new" });

    expect(gate.getState()).toBe("active");
  });

  test("an empty configure keeps credentials but bumps the generation", () => {
    const gate = new AuthGate();
    gate.configure({ managementKey: "cps_key", refreshToken: "cpr_adm_r1" });
    const generation = gate.getGeneration();

    gate.configure({});

    expect(gate.getGeneration()).toBe(generation + 1);
    expect(gate.getState()).toBe("active");
    expect(gate.hasRefreshToken()).toBe(true);
  });

  test("adopting rotated tokens continues the same generation", () => {
    const gate = new AuthGate();
    gate.configure({ managementKey: "cps_a1", refreshToken: "cpr_adm_r1" });
    const generation = gate.getGeneration();

    gate.adoptRotated("cps_a2", "cpr_adm_r2");

    // Bumping here would cancel the very request that triggered the refresh.
    expect(gate.getGeneration()).toBe(generation);
    expect(gate.getState()).toBe("active");
    expect(gate.getManagementKey()).toBe("cps_a2");
    expect(gate.getRefreshToken()).toBe("cpr_adm_r2");
  });
});
