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
    mocks.put.mockResolvedValue({});

    await apiKeyPermissionProfilesApi.replace([
      {
        id: "standard",
        name: "Standard",
        "daily-limit": 15000,
        "total-quota": 0,
        "concurrency-limit": 0,
        "rpm-limit": 0,
        "tpm-limit": 0,
        "allowed-channel-groups": ["pro"],
        "allowed-channels": [],
        "allowed-models": [],
        "system-prompt": "",
      },
    ]);

    expect(mocks.put).toHaveBeenCalledWith("/api-key-permission-profiles", [
      expect.objectContaining({
        id: "standard",
        name: "Standard",
        "daily-limit": 15000,
        "allowed-channel-groups": ["pro"],
      }),
    ]);
    expect(mocks.putRawText).not.toHaveBeenCalled();
  });

  test("uses explicit profile binding and does not infer unrestricted entries as bound", () => {
    const profiles = [
      {
        id: "unrestricted",
        name: "Unrestricted",
        "daily-limit": 0,
        "total-quota": 0,
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
