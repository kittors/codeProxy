import { beforeEach, describe, expect, test, vi } from "vitest";
import { portalClient } from "../../client/portal-client";
import {
  accessFreezesApi,
  normalizeAccessFreeze,
  normalizeAccessFreezeSettings,
  normalizeAccessFreezeStrike,
  normalizePortalAccessFreeze,
  portalAccessFreezesApi,
} from "../access-freezes";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
}));

vi.mock("../../client/client", () => ({
  apiClient: { get: mocks.get, post: mocks.post, put: mocks.put },
}));

const subject = { tenant_id: "t1", kind: "end_user", id: "user-1" };

const freezeBody = {
  id: 7,
  subject,
  subject_name: "Alice",
  provider: "codex",
  provider_name: "Codex",
  reason_code: "cyber_policy",
  upstream_message: "This content was flagged for possible cybersecurity risk.",
  model: "gpt-6.1-sol",
  auth_label: "codex-a.json",
  request_id: "req-1",
  strike_count: 3,
  frozen_at: "2026-11-13T02:00:00Z",
  notice: "Access to Codex is frozen. 该上游已冻结。",
};

describe("normalizeAccessFreeze", () => {
  test("reads a standing freeze and leaves the release fields off", () => {
    expect(normalizeAccessFreeze(freezeBody)).toEqual({
      ...freezeBody,
      released_at: undefined,
      released_by: undefined,
      release_note: undefined,
    });
  });

  test("names the frozen requester as the backend resolved it, and an older backend not at all", () => {
    expect(normalizeAccessFreeze({ ...freezeBody, subject_name: "  Alice  " })?.subject_name).toBe(
      "Alice",
    );
    const { subject_name: _omitted, ...olderBackend } = freezeBody;
    expect(normalizeAccessFreeze(olderBackend)?.subject_name).toBe("");
  });

  test("reads a released freeze, and drops what is blank", () => {
    const freeze = normalizeAccessFreeze({
      ...freezeBody,
      auth_label: "  ",
      request_id: undefined,
      released_at: "2026-11-13T03:00:00Z",
      released_by: "admin",
      release_note: "confirmed with the user",
    });
    expect(freeze).toMatchObject({
      released_at: "2026-11-13T03:00:00Z",
      released_by: "admin",
      release_note: "confirmed with the user",
      auth_label: undefined,
      request_id: undefined,
    });
  });

  test("keeps a subject kind it does not know, and a provider with no vendor name", () => {
    const freeze = normalizeAccessFreeze({
      ...freezeBody,
      subject: { ...subject, kind: "team" },
      provider: "",
      provider_name: "",
    });
    expect(freeze?.subject.kind).toBe("team");
    expect(freeze?.provider_name).toBe("");
  });

  test("never lets a bad count or text through", () => {
    const freeze = normalizeAccessFreeze({
      ...freezeBody,
      strike_count: "x",
      model: 5,
      notice: null,
    });
    expect(freeze).toMatchObject({ strike_count: 0, model: "", notice: "" });
  });

  test.each<[string, unknown]>([
    ["nothing", undefined],
    ["a string", "freeze"],
    ["an array", [freezeBody]],
    ["no id", { ...freezeBody, id: undefined }],
    ["a zero id", { ...freezeBody, id: 0 }],
    ["no subject", { ...freezeBody, subject: undefined }],
    ["a subject without an id", { ...freezeBody, subject: { kind: "end_user" } }],
  ])("is not a freeze when it is %s", (_name, raw) => {
    expect(normalizeAccessFreeze(raw)).toBeNull();
  });
});

describe("normalizeAccessFreezeStrike", () => {
  test("reads the evidence of one refusal", () => {
    const strike = normalizeAccessFreezeStrike({
      id: 11,
      subject,
      provider: "codex",
      provider_name: "Codex",
      reason_code: "cyber_policy",
      upstream_message: "flagged",
      model: "gpt-6.1-sol",
      auth_label: "codex-a.json",
      request_id: "req-1",
      created_at: "2026-11-13T01:59:00Z",
    });
    expect(strike).toMatchObject({
      id: 11,
      request_id: "req-1",
      created_at: "2026-11-13T01:59:00Z",
    });
    expect(normalizeAccessFreezeStrike({ id: 0, subject })).toBeNull();
  });
});

describe("normalizeAccessFreezeSettings", () => {
  test("reads the threshold with the backend's default and limit", () => {
    expect(
      normalizeAccessFreezeSettings({ threshold: 0, default_threshold: 1, max_threshold: 100 }),
    ).toEqual({ threshold: 0, default_threshold: 1, max_threshold: 100 });
  });

  test.each<[string, unknown]>([
    ["nothing", undefined],
    ["a threshold that is a string", { threshold: "1" }],
    ["a negative threshold", { threshold: -1 }],
    ["a fractional threshold", { threshold: 1.5 }],
    ["no threshold", { default_threshold: 1, max_threshold: 100 }],
  ])("is not the settings when it has %s", (_name, raw) => {
    expect(normalizeAccessFreezeSettings(raw)).toBeNull();
  });
});

describe("normalizePortalAccessFreeze", () => {
  test("keeps what the portal may show and nothing about the channel", () => {
    const item = normalizePortalAccessFreeze({
      ...freezeBody,
      provider: "",
      provider_name: "",
    });
    expect(item).toEqual({
      provider: "",
      provider_name: "",
      reason_code: "cyber_policy",
      model: "gpt-6.1-sol",
      frozen_at: "2026-11-13T02:00:00Z",
      notice: freezeBody.notice,
    });
    expect(item).not.toHaveProperty("auth_label");
    expect(item).not.toHaveProperty("request_id");
  });

  test("an entry with neither a notice nor a time says nothing", () => {
    expect(normalizePortalAccessFreeze({ provider: "codex" })).toBeNull();
    expect(normalizePortalAccessFreeze("x")).toBeNull();
  });
});

describe("accessFreezesApi", () => {
  beforeEach(() => {
    mocks.get.mockReset();
    mocks.post.mockReset();
    mocks.put.mockReset();
  });

  test("lists with no filter by asking for no query at all", async () => {
    mocks.get.mockResolvedValue({ items: [freezeBody, { nope: true }] });
    const items = await accessFreezesApi.list();
    expect(mocks.get).toHaveBeenCalledWith("/end-users/access-freezes", undefined);
    // An entry that is not a freeze is dropped rather than shown as a blank row.
    expect(items.map((item) => item.id)).toEqual([7]);
  });

  test("lists one requester's freezes with every filter the backend takes", async () => {
    mocks.get.mockResolvedValue({ items: [] });
    await accessFreezesApi.list({
      status: "all",
      subjectKind: "api_key",
      subjectId: "key 1",
      provider: "codex",
      limit: 200,
    });
    expect(mocks.get).toHaveBeenCalledWith(
      "/end-users/access-freezes?status=all&subject_kind=api_key&subject_id=key+1&provider=codex&limit=200",
      undefined,
    );
  });

  test("answers an empty list when the body is not a list", async () => {
    mocks.get.mockResolvedValue("<html>proxy</html>");
    await expect(accessFreezesApi.list({ status: "active" })).resolves.toEqual([]);
  });

  test("reads the refusals of one requester, and needs the requester named", async () => {
    mocks.get.mockResolvedValue({
      items: [{ id: 11, subject, provider: "codex", created_at: "2026-11-13T01:59:00Z" }],
    });
    const items = await accessFreezesApi.strikes({
      subjectKind: "end_user",
      subjectId: "user-1",
      provider: "codex",
      limit: 100,
    });
    expect(mocks.get).toHaveBeenCalledWith(
      "/end-users/access-freezes/strikes?subject_kind=end_user&subject_id=user-1&provider=codex&limit=100",
      undefined,
    );
    expect(items).toHaveLength(1);
  });

  test("releases with the note trimmed, or with an empty body when there is none", async () => {
    mocks.post.mockResolvedValue({
      freeze: { ...freezeBody, released_at: "2026-11-13T03:00:00Z", released_by: "admin" },
    });
    const released = await accessFreezesApi.release(7, "  confirmed with the user  ");
    expect(mocks.post).toHaveBeenCalledWith("/end-users/access-freezes/7/release", {
      note: "confirmed with the user",
    });
    expect(released.released_by).toBe("admin");

    await accessFreezesApi.release(7, "   ");
    expect(mocks.post).toHaveBeenLastCalledWith("/end-users/access-freezes/7/release", {});
    await accessFreezesApi.release(7);
    expect(mocks.post).toHaveBeenLastCalledWith("/end-users/access-freezes/7/release", {});
  });

  test("a release answered with something that is not a freeze cannot be confirmed", async () => {
    mocks.post.mockResolvedValue({ status: "ok" });
    await expect(accessFreezesApi.release(7)).rejects.toThrow(/Unexpected response/);
  });

  test("reads and writes the threshold", async () => {
    mocks.get.mockResolvedValue({ threshold: 1, default_threshold: 1, max_threshold: 100 });
    await expect(accessFreezesApi.getSettings()).resolves.toEqual({
      threshold: 1,
      default_threshold: 1,
      max_threshold: 100,
    });
    expect(mocks.get).toHaveBeenCalledWith("/end-users/access-freezes/settings", undefined);

    mocks.put.mockResolvedValue({ threshold: 0, default_threshold: 1, max_threshold: 100 });
    // 0 is a real choice (record only), not "unset": it is sent as 0.
    await expect(accessFreezesApi.putSettings(0)).resolves.toMatchObject({ threshold: 0 });
    expect(mocks.put).toHaveBeenCalledWith("/end-users/access-freezes/settings", { threshold: 0 });
  });

  test("a settings answer without a threshold is not trusted", async () => {
    mocks.get.mockResolvedValue({ items: [] });
    await expect(accessFreezesApi.getSettings()).rejects.toThrow(/Unexpected response/);
    mocks.put.mockResolvedValue("ok");
    await expect(accessFreezesApi.putSettings(2)).rejects.toThrow(/Unexpected response/);
  });
});

describe("portalAccessFreezesApi", () => {
  test("reads the signed-in user's own freezes under /v0/portal", async () => {
    const get = vi.spyOn(portalClient, "get").mockResolvedValue({
      items: [
        {
          provider: "codex",
          provider_name: "Codex",
          reason_code: "cyber_policy",
          model: "gpt-6.1-sol",
          frozen_at: "2026-11-13T02:00:00Z",
          notice: "frozen",
        },
        { junk: true },
      ],
    });
    const items = await portalAccessFreezesApi.list();
    expect(get).toHaveBeenCalledWith("/v0/portal/access-freezes", undefined);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ provider_name: "Codex", notice: "frozen" });
  });
});
