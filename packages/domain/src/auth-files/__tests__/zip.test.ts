import { describe, expect, it } from "vitest";
import {
  buildAuthFilesBatchZipName,
  crc32,
  createStoreZipBlob,
  createStoreZipBytes,
} from "../zip";

const readUint32LE = (bytes: Uint8Array, offset: number) =>
  bytes[offset]! |
  (bytes[offset + 1]! << 8) |
  (bytes[offset + 2]! << 16) |
  (bytes[offset + 3]! << 24);

const readUint16LE = (bytes: Uint8Array, offset: number) =>
  bytes[offset]! | (bytes[offset + 1]! << 8);

describe("createStoreZipBytes", () => {
  it("builds a valid store zip with multiple entries", () => {
    const a = new TextEncoder().encode('{"type":"a"}');
    const b = new TextEncoder().encode('{"type":"b"}');
    const zip = createStoreZipBytes([
      { name: "alpha.json", data: a },
      { name: "beta.json", data: b },
    ]);

    // Local file headers
    expect(readUint32LE(zip, 0)).toBe(0x04034b50);
    const nameLenA = readUint16LE(zip, 26);
    expect(nameLenA).toBe("alpha.json".length);
    const dataStartA = 30 + nameLenA;
    // Compare via Array.from: vitest can fail Uint8Array views with "no visual difference".
    expect(Array.from(zip.slice(dataStartA, dataStartA + a.length))).toEqual(Array.from(a));

    const localB = dataStartA + a.length;
    expect(readUint32LE(zip, localB)).toBe(0x04034b50);
    const nameLenB = readUint16LE(zip, localB + 26);
    const dataStartB = localB + 30 + nameLenB;
    expect(Array.from(zip.slice(dataStartB, dataStartB + b.length))).toEqual(Array.from(b));

    // End of central directory
    const eocd = zip.length - 22;
    expect(readUint32LE(zip, eocd)).toBe(0x06054b50);
    expect(readUint16LE(zip, eocd + 8)).toBe(2);
    expect(readUint16LE(zip, eocd + 10)).toBe(2);

    // CRC of first entry matches
    expect(readUint32LE(zip, 14) >>> 0).toBe(crc32(a));
  });

  it("rejects empty entry lists", () => {
    expect(() => createStoreZipBytes([])).toThrow(/at least one entry/);
  });

  it("creates a zip blob", async () => {
    const blob = createStoreZipBlob([{ name: "x.json", data: new Uint8Array([1, 2, 3]) }]);
    expect(blob.type).toBe("application/zip");
    expect(blob.size).toBeGreaterThan(22);
  });
});

describe("buildAuthFilesBatchZipName", () => {
  it("includes count and timestamp", () => {
    const name = buildAuthFilesBatchZipName(3, new Date("2026-07-12T08:09:10"));
    expect(name).toMatch(/^auth-files-3-\d{8}-\d{6}\.zip$/);
  });
});
