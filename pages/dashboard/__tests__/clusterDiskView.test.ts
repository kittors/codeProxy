import { describe, expect, test } from "vitest";
import type { NodeDisk } from "@code-proxy/api-client";
import { diskView, formatFillTime, sortDisks } from "../clusterDiskView";

const GB = 1024 ** 3;

const disk = (over: Partial<NodeDisk> = {}): NodeDisk => ({
  mount: "/",
  fs_type: "xfs",
  paths: [
    { use: "root", path: "/" },
    { use: "workdir", path: "/opt/clirelay2" },
    { use: "logs", path: "/opt/clirelay2/logs" },
    { use: "logs", path: "/opt/clirelay2/logs/errors" },
  ],
  // hk-155 on 2026-11-17: 32 GB, 14.9 GB used, 17.2 GB available.
  total_bytes: 32_144_076_800,
  used_bytes: 14_905_135_104,
  available_bytes: 17_238_941_696,
  inodes_total: 15_728_064,
  inodes_free: 15_634_235,
  ...over,
});

describe("clusterDiskView", () => {
  test("reads a disk the way df does", () => {
    const view = diskView(disk());
    // df's Use%: used / (used + available), not used / total.
    expect(view.pct).toBeCloseTo(46.4, 1);
    expect(view.inodePct).toBeCloseTo(0.6, 1);
    expect(view.uses).toEqual(["root", "workdir", "logs"]);
    expect(view.level).toBe("normal");
    expect(view.concern).toBeNull();
    expect(view.fillSeconds).toBeNull();
  });

  test("warns from 80% and turns critical from 90%, inodes too", () => {
    expect(diskView(disk({ used_bytes: 79 * GB, available_bytes: 21 * GB })).level).toBe("normal");
    expect(diskView(disk({ used_bytes: 80 * GB, available_bytes: 20 * GB }))).toMatchObject({
      level: "warn",
      concern: "space",
    });
    expect(diskView(disk({ used_bytes: 90 * GB, available_bytes: 10 * GB }))).toMatchObject({
      level: "critical",
      concern: "space",
    });
    // Root's reserved blocks: total minus used is 10 GB, but only 5 GB can be written.
    expect(diskView(disk({ total_bytes: 100 * GB, used_bytes: 90 * GB, available_bytes: 5 * GB })).pct).toBeCloseTo(94.7, 1);
    expect(diskView(disk({ inodes_total: 1000, inodes_free: 95 }))).toMatchObject({
      level: "critical",
      concern: "inodes",
    });
    // A filesystem without an inode table reports none.
    expect(diskView(disk({ inodes_total: undefined, inodes_free: undefined })).inodePct).toBeNull();
    expect(diskView(disk({ read_only: true }))).toMatchObject({ level: "critical", concern: "read_only" });
  });

  test("estimates when a growing disk fills, and ignores shrinking ones", () => {
    // 2 GB in the last hour with 17.2 GB free: full in about 8.6 hours.
    const growing = diskView(disk({ growth: { window_seconds: 3600, used_delta_bytes: 2 * GB } }));
    expect(growing.fillSeconds).toBeCloseTo((17_238_941_696 / (2 * GB)) * 3600, 0);
    expect(growing).toMatchObject({ level: "critical", concern: "fill" });
    expect(formatFillTime(growing.fillSeconds ?? 0)).toBe("8h");

    // 200 MB an hour fills it in about 3.4 days, just past the 3-day line; 250 MB in 2.7 days.
    const slow = diskView(disk({ growth: { window_seconds: 3600, used_delta_bytes: 200 * 1024 ** 2 } }));
    expect(slow.level).toBe("normal");
    const steady = diskView(disk({ growth: { window_seconds: 3600, used_delta_bytes: 250 * 1024 ** 2 } }));
    expect(steady).toMatchObject({ level: "warn", concern: "fill" });

    const shrinking = diskView(disk({ growth: { window_seconds: 3600, used_delta_bytes: -3 * GB } }));
    expect(shrinking.fillSeconds).toBeNull();
    expect(shrinking.level).toBe("normal");
  });

  test("puts the disk most in need of attention first", () => {
    const root = disk();
    const tmp = disk({
      mount: "/tmp",
      fs_type: "tmpfs",
      paths: [{ use: "body_cache", path: "/tmp/clirelay-body" }],
      total_bytes: 2 * GB,
      used_bytes: 1.7 * GB,
      available_bytes: 0.3 * GB,
    });
    expect(sortDisks([root, tmp]).map((view) => view.mount)).toEqual(["/tmp", "/"]);
    expect(sortDisks(undefined)).toEqual([]);
  });

  test("says how long until full in the units an operator reads", () => {
    expect(formatFillTime(40)).toBe("1m");
    expect(formatFillTime(45 * 60)).toBe("45m");
    expect(formatFillTime(18 * 3600)).toBe("18h");
    expect(formatFillTime(3 * 86_400)).toBe("3d");
    expect(formatFillTime(120 * 86_400)).toBeNull();
  });
});
