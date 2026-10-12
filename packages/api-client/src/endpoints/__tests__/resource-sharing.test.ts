import { beforeEach, describe, expect, test, vi } from "vitest";

const getMock = vi.fn();
const putMock = vi.fn();
const postMock = vi.fn();

vi.mock("../../client/client", () => ({
  apiClient: {
    get: getMock,
    put: putMock,
    post: postMock,
  },
}));

describe("resource sharing normalization", () => {
  test("treats a missing or malformed capability as unsupported (old backends)", async () => {
    const { normalizeSharingCapability } =
      await import("@code-proxy/api-client/endpoints/resource-sharing");
    expect(normalizeSharingCapability(undefined)).toEqual({ supported: false, manageable: false });
    expect(normalizeSharingCapability({ supported: "yes", manageable: true })).toEqual({
      supported: false,
      manageable: false,
    });
    // manageable only counts when the backend supports sharing at all.
    expect(normalizeSharingCapability({ supported: false, manageable: true })).toEqual({
      supported: false,
      manageable: false,
    });
    expect(normalizeSharingCapability({ supported: true })).toEqual({
      supported: true,
      manageable: false,
    });
    expect(normalizeSharingCapability({ supported: true, manageable: true })).toEqual({
      supported: true,
      manageable: true,
    });
  });

  test("reads {all, tenant_ids} and returns null when nothing is shared", async () => {
    const { normalizeResourceSharing } =
      await import("@code-proxy/api-client/endpoints/resource-sharing");
    expect(normalizeResourceSharing(undefined)).toBeNull();
    expect(normalizeResourceSharing({ all: false, tenant_ids: [] })).toBeNull();
    expect(normalizeResourceSharing({ all: true, tenant_ids: ["ignored"] })).toEqual({
      all: true,
      tenantIds: [],
    });
    expect(
      normalizeResourceSharing({ all: false, tenant_ids: [" t1 ", "t2", "t1", "", 3] }),
    ).toEqual({
      all: false,
      tenantIds: ["t1", "t2"],
    });
  });

  test("names tenants by id when the name is missing and drops duplicates", async () => {
    const { normalizeTenantRefs } =
      await import("@code-proxy/api-client/endpoints/resource-sharing");
    expect(
      normalizeTenantRefs([
        { id: "t1", name: "Potato" },
        { id: "t2" },
        { id: "t1", name: "again" },
        { name: "no id" },
        null,
      ]),
    ).toEqual([
      { id: "t1", name: "Potato" },
      { id: "t2", name: "t2" },
    ]);
    expect(normalizeTenantRefs("nope")).toEqual([]);
  });

  test("sends no tenant list when sharing with every tenant", async () => {
    const { toSharingRequestBody } =
      await import("@code-proxy/api-client/endpoints/resource-sharing");
    expect(toSharingRequestBody({ all: true, tenantIds: ["t1"] })).toEqual({
      all: true,
      tenant_ids: [],
    });
    expect(toSharingRequestBody({ all: false, tenantIds: ["t1", "t1", " t2 "] })).toEqual({
      all: false,
      tenant_ids: ["t1", "t2"],
    });
    expect(toSharingRequestBody({ all: false, tenantIds: [] })).toEqual({
      all: false,
      tenant_ids: [],
    });
  });
});

describe("auth files sharing", () => {
  beforeEach(() => {
    getMock.mockReset();
    putMock.mockReset();
    postMock.mockReset();
  });

  test("hides shared files when the backend does not declare sharing support", async () => {
    const { readAuthFilesSharing } = await import("@code-proxy/api-client/endpoints/auth-files");
    // An old backend never sends `sharing`; even a stray shared_files list must not surface.
    expect(
      readAuthFilesSharing({
        files: [],
        shared_files: [{ name: "shared.json" }],
      }),
    ).toEqual({ sharing: { supported: false, manageable: false }, sharedFiles: [] });
    expect(readAuthFilesSharing(undefined).sharedFiles).toEqual([]);
  });

  test("marks shared files and skips entries without a name", async () => {
    const { readAuthFilesSharing } = await import("@code-proxy/api-client/endpoints/auth-files");
    const view = readAuthFilesSharing({
      files: [],
      sharing: { supported: true, manageable: false },
      shared_files: [
        { name: "codex-a.json", type: "codex", email: "a@example.com" },
        { name: "  " },
      ],
    });
    expect(view.sharing).toEqual({ supported: true, manageable: false });
    expect(view.sharedFiles).toEqual([
      { name: "codex-a.json", type: "codex", email: "a@example.com", shared: true },
    ]);
  });

  test("updates sharing by account id and returns the normalized grant", async () => {
    const { authFilesApi, authFileSharingId } =
      await import("@code-proxy/api-client/endpoints/auth-files");
    putMock.mockResolvedValue({
      status: "ok",
      ids: ["codex-a.json"],
      sharing: { all: false, tenant_ids: ["t1"] },
    });

    const result = await authFilesApi.updateSharing({
      ids: [authFileSharingId({ id: "codex-a.json", name: "codex-a.json" })],
      all: false,
      tenantIds: ["t1", "t1"],
    });

    expect(putMock).toHaveBeenCalledWith("/auth-files/sharing", {
      ids: ["codex-a.json"],
      all: false,
      tenant_ids: ["t1"],
    });
    expect(result).toEqual({ ids: ["codex-a.json"], sharing: { all: false, tenantIds: ["t1"] } });
  });

  test("falls back to the file name when an account has no id", async () => {
    const { authFileSharingId } = await import("@code-proxy/api-client/endpoints/auth-files");
    expect(authFileSharingId({ name: "legacy.json" })).toBe("legacy.json");
    expect(authFileSharingId({ id: " ", name: "legacy.json" })).toBe("legacy.json");
    expect(authFileSharingId({ id: "auth-1", name: "legacy.json" })).toBe("auth-1");
  });

  test("returns null sharing after unsharing", async () => {
    const { authFilesApi } = await import("@code-proxy/api-client/endpoints/auth-files");
    putMock.mockResolvedValue({ status: "ok", ids: ["a", "b"], sharing: null });

    const result = await authFilesApi.updateSharing({ ids: ["a", "b"], all: false, tenantIds: [] });

    expect(putMock).toHaveBeenCalledWith("/auth-files/sharing", {
      ids: ["a", "b"],
      all: false,
      tenant_ids: [],
    });
    expect(result).toEqual({ ids: ["a", "b"], sharing: null });
  });
});
