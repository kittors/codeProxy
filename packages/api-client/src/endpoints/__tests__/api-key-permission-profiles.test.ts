import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  apiKeyPermissionProfilesApi,
  resolveEntryPermissionProfileId,
} from "@code-proxy/api-client/endpoints/api-key-permission-profiles";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  getText: vi.fn(),
  putRawText: vi.fn(),
}));

vi.mock("../../client/client", () => ({
  apiClient: {
    get: mocks.get,
    put: mocks.put,
    getText: mocks.getText,
    putRawText: mocks.putRawText,
  },
}));

describe("apiKeyPermissionProfilesApi", () => {
  beforeEach(() => {
    mocks.get.mockReset();
    mocks.put.mockReset();
    mocks.getText.mockReset();
    mocks.putRawText.mockReset();
  });

  test("loads permission profiles from the management database endpoint", async () => {
    mocks.get.mockResolvedValue({
      "api-key-permission-profiles": [
        {
          id: "standard",
          name: "Standard",
          "daily-limit": 15000,
          "allowed-channel-groups": ["pro"],
        },
      ],
    });

    await expect(apiKeyPermissionProfilesApi.list()).resolves.toEqual([
      expect.objectContaining({
        id: "standard",
        name: "Standard",
        "daily-limit": 15000,
        "allowed-channel-groups": ["pro"],
      }),
    ]);

    expect(mocks.get).toHaveBeenCalledWith("/api-key-permission-profiles");
    expect(mocks.getText).not.toHaveBeenCalled();
  });

  test("replaces permission profiles through the management database endpoint", async () => {
    mocks.put.mockResolvedValue({ applied_count: 2 });

    await expect(
      apiKeyPermissionProfilesApi.replace(
        [
          {
            id: "standard",
            name: "Standard",
            "daily-limit": 15000,
            "total-quota": 0,
            "daily-spending-limit": 100.5,
            "period-spending-limits": { "5h": 50, day: 100.5, week: 500, month: 2000 },
            "concurrency-limit": 0,
            "rpm-limit": 0,
            "tpm-limit": 0,
            "allowed-channel-groups": ["pro"],
            "allowed-channels": [],
            "allowed-models": [],
            "system-prompt": "",
          },
        ],
        { syncAccounts: true },
      ),
    ).resolves.toEqual({ appliedCount: 2, cappedKeys: [] });

    expect(mocks.put).toHaveBeenCalledWith("/api-key-permission-profiles", {
      items: [
        expect.objectContaining({
          id: "standard",
          name: "Standard",
          "daily-limit": 15000,
          "daily-spending-limit": 100.5,
          "allowed-channel-groups": ["pro"],
        }),
      ],
      "sync-accounts": true,
    });
    expect(mocks.putRawText).not.toHaveBeenCalled();
  });

  test("returns validated capped key details from profile sync", async () => {
    mocks.put.mockResolvedValue({
      applied_count: 3,
      "capped-keys": [
        { id: "key-1", period: "day", from: 200, to: 100 },
        { id: "key-2", period: "invalid", from: 20, to: 10 },
        { id: "key-3", period: "week", from: "20", to: 10 },
      ],
    });

    await expect(apiKeyPermissionProfilesApi.replace([], { syncAccounts: true })).resolves.toEqual({
      appliedCount: 3,
      cappedKeys: [{ id: "key-1", period: "day", from: 200, to: 100 }],
    });
  });

  test("maps the legacy daily spending limit into the day period", async () => {
    mocks.get.mockResolvedValue({
      "api-key-permission-profiles": [
        {
          id: "legacy",
          name: "Legacy",
          "daily-spending-limit": 125,
        },
      ],
    });

    await expect(apiKeyPermissionProfilesApi.list()).resolves.toEqual([
      expect.objectContaining({
        "daily-spending-limit": 125,
        "period-spending-limits": { "5h": 0, day: 125, week: 0, month: 0 },
      }),
    ]);
  });

  test("uses explicit profile binding and does not infer unrestricted entries as bound", () => {
    const profiles = [
      {
        id: "unrestricted",
        name: "Unrestricted",
        "daily-limit": 0,
        "total-quota": 0,
        "daily-spending-limit": 0,
        "period-spending-limits": { "5h": 0, day: 0, week: 0, month: 0 },
        "concurrency-limit": 0,
        "rpm-limit": 0,
        "tpm-limit": 0,
        "allowed-channel-groups": [],
        "allowed-channels": [],
        "allowed-models": [],
        "system-prompt": "",
      },
    ];

    expect(
      resolveEntryPermissionProfileId(
        {
          key: "sk-explicit",
          "permission-profile-id": "unrestricted",
        },
        profiles,
      ),
    ).toBe("unrestricted");

    expect(
      resolveEntryPermissionProfileId(
        {
          key: "sk-plain",
        },
        profiles,
      ),
    ).toBe("");
  });
});
