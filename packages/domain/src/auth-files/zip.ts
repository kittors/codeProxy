/** Minimal ZIP (STORE) builder for browser batch downloads. No external deps. */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

export const crc32 = (data: Uint8Array): number => {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    c = CRC_TABLE[(c ^ data[i]!) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
};

export type ZipStoreEntry = {
  name: string;
  data: Uint8Array;
};

const textEncoder = new TextEncoder();

const writeUint16LE = (view: DataView, offset: number, value: number) => {
  view.setUint16(offset, value & 0xffff, true);
};

const writeUint32LE = (view: DataView, offset: number, value: number) => {
  view.setUint32(offset, value >>> 0, true);
};

const concatBytes = (chunks: Uint8Array[]): Uint8Array => {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
};

const dosDateTime = (date = new Date()): { time: number; date: number } => {
  const year = Math.max(1980, date.getFullYear());
  const time =
    ((date.getHours() & 0x1f) << 11) |
    ((date.getMinutes() & 0x3f) << 5) |
    (Math.floor(date.getSeconds() / 2) & 0x1f);
  const dosDate =
    (((year - 1980) & 0x7f) << 9) | (((date.getMonth() + 1) & 0xf) << 5) | (date.getDate() & 0x1f);
  return { time, date: dosDate };
};

/**
 * Build an uncompressed (STORE) ZIP archive.
 * Filenames are encoded as UTF-8 with the language-encoding flag set.
 */
export const createStoreZipBytes = (
  entries: ZipStoreEntry[],
  options?: { modifiedAt?: Date },
): Uint8Array => {
  if (entries.length === 0) {
    throw new Error("createStoreZipBytes requires at least one entry");
  }

  const { time, date } = dosDateTime(options?.modifiedAt);
  // Bit 11: UTF-8 filename
  const generalPurposeFlag = 0x0800;
  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = String(entry.name ?? "").trim() || "file";
    // ZIP paths use forward slashes; strip leading slashes / drive tricks.
    const safeName = name.replace(/\\/g, "/").replace(/^\/+/, "");
    const nameBytes = textEncoder.encode(safeName);
    const data = entry.data;
    const checksum = crc32(data);
    const size = data.length;

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    writeUint32LE(localView, 0, 0x04034b50);
    writeUint16LE(localView, 4, 20); // version needed
    writeUint16LE(localView, 6, generalPurposeFlag);
    writeUint16LE(localView, 8, 0); // store
    writeUint16LE(localView, 10, time);
    writeUint16LE(localView, 12, date);
    writeUint32LE(localView, 14, checksum);
    writeUint32LE(localView, 18, size);
    writeUint32LE(localView, 22, size);
    writeUint16LE(localView, 26, nameBytes.length);
    writeUint16LE(localView, 28, 0); // extra length
    localHeader.set(nameBytes, 30);

    localChunks.push(localHeader, data);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    writeUint32LE(centralView, 0, 0x02014b50);
    writeUint16LE(centralView, 4, 20); // version made by
    writeUint16LE(centralView, 6, 20); // version needed
    writeUint16LE(centralView, 8, generalPurposeFlag);
    writeUint16LE(centralView, 10, 0);
    writeUint16LE(centralView, 12, time);
    writeUint16LE(centralView, 14, date);
    writeUint32LE(centralView, 16, checksum);
    writeUint32LE(centralView, 20, size);
    writeUint32LE(centralView, 24, size);
    writeUint16LE(centralView, 28, nameBytes.length);
    writeUint16LE(centralView, 30, 0); // extra
    writeUint16LE(centralView, 32, 0); // comment
    writeUint16LE(centralView, 34, 0); // disk start
    writeUint16LE(centralView, 36, 0); // internal attrs
    writeUint32LE(centralView, 38, 0); // external attrs
    writeUint32LE(centralView, 42, localOffset);
    centralHeader.set(nameBytes, 46);
    centralChunks.push(centralHeader);

    localOffset += localHeader.length + data.length;
  }

  const centralDirectory = concatBytes(centralChunks);
  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);
  writeUint32LE(endView, 0, 0x06054b50);
  writeUint16LE(endView, 4, 0);
  writeUint16LE(endView, 6, 0);
  writeUint16LE(endView, 8, entries.length);
  writeUint16LE(endView, 10, entries.length);
  writeUint32LE(endView, 12, centralDirectory.length);
  writeUint32LE(endView, 16, localOffset);
  writeUint16LE(endView, 20, 0);

  return concatBytes([...localChunks, centralDirectory, endRecord]);
};

export const createStoreZipBlob = (
  entries: ZipStoreEntry[],
  options?: { modifiedAt?: Date },
): Blob => {
  const bytes = createStoreZipBytes(entries, options);
  // Copy into a plain ArrayBuffer (not SharedArrayBuffer) for BlobPart compatibility.
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new Blob([buffer], { type: "application/zip" });
};

export const buildAuthFilesBatchZipName = (count: number, now = new Date()): string => {
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    "-",
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join("");
  return `auth-files-${count}-${stamp}.zip`;
};
