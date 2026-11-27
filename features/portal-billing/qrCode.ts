/**
 * Zero-dependency ISO/IEC 18004 QR Code encoder (Byte mode, Error Correction Level M,
 * versions 1..10, up to 213 UTF-8 bytes — sufficient for shareable pay links and XunhuPay URLs).
 */

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(() => {
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) {
    GF_EXP[i] = GF_EXP[i - 255];
  }
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function rsGeneratorPoly(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i += 1) {
    const next = new Uint8Array(poly.length + 1);
    const factor = GF_EXP[i];
    for (let j = 0; j < poly.length; j += 1) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], factor);
    }
    poly = next;
  }
  return poly;
}

function rsRemainder(data: Uint8Array, ecCount: number): Uint8Array {
  const gen = rsGeneratorPoly(ecCount);
  const rem = new Uint8Array(ecCount);
  for (const byte of data) {
    const factor = byte ^ rem[0];
    rem.copyWithin(0, 1);
    rem[ecCount - 1] = 0;
    for (let j = 0; j < ecCount; j += 1) {
      rem[j] ^= gfMul(gen[j + 1], factor);
    }
  }
  return rem;
}

interface VersionSpec {
  version: number;
  size: number;
  totalCodewords: number;
  ecPerBlock: number;
  blocks: Array<[count: number, dataWords: number]>;
  alignment: number[];
}

// Error correction level M tables for versions 1..10 (ISO 18004 Table 9 & Annex E).
const VERSIONS_M: VersionSpec[] = [
  { version: 1, size: 21, totalCodewords: 26, ecPerBlock: 10, blocks: [[1, 16]], alignment: [] },
  { version: 2, size: 25, totalCodewords: 44, ecPerBlock: 16, blocks: [[1, 28]], alignment: [6, 18] },
  { version: 3, size: 29, totalCodewords: 70, ecPerBlock: 26, blocks: [[1, 44]], alignment: [6, 22] },
  { version: 4, size: 33, totalCodewords: 100, ecPerBlock: 18, blocks: [[2, 32]], alignment: [6, 26] },
  { version: 5, size: 37, totalCodewords: 134, ecPerBlock: 24, blocks: [[2, 43]], alignment: [6, 30] },
  { version: 6, size: 41, totalCodewords: 172, ecPerBlock: 16, blocks: [[4, 27]], alignment: [6, 34] },
  { version: 7, size: 45, totalCodewords: 196, ecPerBlock: 18, blocks: [[4, 31]], alignment: [6, 22, 38] },
  {
    version: 8,
    size: 49,
    totalCodewords: 242,
    ecPerBlock: 22,
    blocks: [
      [2, 38],
      [2, 39],
    ],
    alignment: [6, 24, 42],
  },
  {
    version: 9,
    size: 53,
    totalCodewords: 292,
    ecPerBlock: 22,
    blocks: [
      [3, 36],
      [2, 37],
    ],
    alignment: [6, 26, 46],
  },
  {
    version: 10,
    size: 57,
    totalCodewords: 346,
    ecPerBlock: 26,
    blocks: [
      [4, 43],
      [1, 44],
    ],
    alignment: [6, 28, 50],
  },
];

function dataCapacity(spec: VersionSpec): number {
  return spec.blocks.reduce((sum, [count, words]) => sum + count * words, 0);
}

function chooseVersion(byteLen: number): VersionSpec {
  for (const spec of VERSIONS_M) {
    const countBits = spec.version <= 9 ? 8 : 16;
    const neededBytes = Math.ceil((4 + countBits + byteLen * 8) / 8);
    if (neededBytes <= dataCapacity(spec)) return spec;
  }
  throw new Error("QR payload exceeds supported length (max 213 bytes)");
}

function buildCodewords(bytes: Uint8Array, spec: VersionSpec): Uint8Array {
  const capacity = dataCapacity(spec);
  const bits: number[] = [];
  const pushBits = (value: number, width: number) => {
    for (let i = width - 1; i >= 0; i -= 1) bits.push((value >>> i) & 1);
  };
  pushBits(0b0100, 4); // Byte mode
  pushBits(bytes.length, spec.version <= 9 ? 8 : 16);
  for (const b of bytes) pushBits(b, 8);
  const maxBits = capacity * 8;
  const term = Math.min(4, maxBits - bits.length);
  for (let i = 0; i < term; i += 1) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);

  const data = new Uint8Array(capacity);
  let idx = 0;
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j += 1) byte = (byte << 1) | bits[i + j];
    data[idx++] = byte;
  }
  const padBytes = [0xec, 0x11];
  for (let p = 0; idx < capacity; p ^= 1) data[idx++] = padBytes[p];

  const dataBlocks: Uint8Array[] = [];
  const ecBlocks: Uint8Array[] = [];
  let offset = 0;
  for (const [count, words] of spec.blocks) {
    for (let b = 0; b < count; b += 1) {
      const slice = data.subarray(offset, offset + words);
      offset += words;
      dataBlocks.push(slice);
      ecBlocks.push(rsRemainder(slice, spec.ecPerBlock));
    }
  }

  const out = new Uint8Array(spec.totalCodewords);
  let outIdx = 0;
  const maxDataLen = Math.max(...dataBlocks.map((b) => b.length));
  for (let i = 0; i < maxDataLen; i += 1) {
    for (const block of dataBlocks) {
      if (i < block.length) out[outIdx++] = block[i];
    }
  }
  for (let i = 0; i < spec.ecPerBlock; i += 1) {
    for (const block of ecBlocks) {
      out[outIdx++] = block[i];
    }
  }
  return out;
}

function formatBitsM(mask: number): number {
  const data = (0b00 << 3) | mask; // EC level M = 00
  let rem = data << 10;
  for (let i = 14; i >= 10; i -= 1) {
    if ((rem >>> i) & 1) rem ^= 0x537 << (i - 10);
  }
  return ((data << 10) | rem) ^ 0x5412;
}

function versionBits(version: number): number {
  let rem = version << 12;
  for (let i = 17; i >= 12; i -= 1) {
    if ((rem >>> i) & 1) rem ^= 0x1f25 << (i - 12);
  }
  return (version << 12) | rem;
}

export function encodeQrMatrix(text: string): boolean[][] {
  const bytes = new TextEncoder().encode(text);
  const spec = chooseVersion(bytes.length);
  const n = spec.size;
  const modules: boolean[][] = Array.from({ length: n }, () => Array<boolean>(n).fill(false));
  const isFunc: boolean[][] = Array.from({ length: n }, () => Array<boolean>(n).fill(false));

  const setFunc = (r: number, c: number, dark: boolean) => {
    if (r >= 0 && r < n && c >= 0 && c < n) {
      modules[r][c] = dark;
      isFunc[r][c] = true;
    }
  };

  const drawFinder = (top: number, left: number) => {
    for (let dr = -1; dr <= 7; dr += 1) {
      for (let dc = -1; dc <= 7; dc += 1) {
        const dist = Math.max(Math.abs(dr - 3), Math.abs(dc - 3));
        setFunc(top + dr, left + dc, dist !== 2 && dist !== 4);
      }
    }
  };
  drawFinder(0, 0);
  drawFinder(0, n - 7);
  drawFinder(n - 7, 0);

  for (let i = 8; i < n - 8; i += 1) {
    setFunc(6, i, i % 2 === 0);
    setFunc(i, 6, i % 2 === 0);
  }

  for (const r of spec.alignment) {
    for (const c of spec.alignment) {
      if ((r === 6 && c === 6) || (r === 6 && c === n - 7) || (r === n - 7 && c === 6)) continue;
      for (let dr = -2; dr <= 2; dr += 1) {
        for (let dc = -2; dc <= 2; dc += 1) {
          setFunc(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
        }
      }
    }
  }

  // Reserve format info & dark module.
  for (let i = 0; i <= 8; i += 1) {
    if (!isFunc[8][i]) setFunc(8, i, false);
    if (!isFunc[i][8]) setFunc(i, 8, false);
  }
  for (let i = n - 8; i < n; i += 1) {
    setFunc(8, i, false);
    setFunc(i, 8, false);
  }
  setFunc(n - 8, 8, true);

  if (spec.version >= 7) {
    const bits = versionBits(spec.version);
    for (let i = 0; i < 18; i += 1) {
      const dark = ((bits >>> i) & 1) === 1;
      const a = Math.floor(i / 3);
      const b = n - 11 + (i % 3);
      setFunc(a, b, dark);
      setFunc(b, a, dark);
    }
  }

  const codewords = buildCodewords(bytes, spec);
  let bitIdx = 0;
  let upward = true;
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let step = 0; step < n; step += 1) {
      const r = upward ? n - 1 - step : step;
      for (let j = 0; j < 2; j += 1) {
        const c = right - j;
        if (isFunc[r][c]) continue;
        let dark = false;
        if (bitIdx < codewords.length * 8) {
          dark = ((codewords[bitIdx >>> 3] >>> (7 - (bitIdx & 7))) & 1) === 1;
        }
        bitIdx += 1;
        // Mask 0: (r + c) % 2 === 0
        modules[r][c] = (r + c) % 2 === 0 ? !dark : dark;
      }
    }
    upward = !upward;
  }

  const fmt = formatBitsM(0);
  for (let i = 0; i <= 5; i += 1) setFunc(8, i, ((fmt >>> i) & 1) === 1);
  setFunc(8, 7, ((fmt >>> 6) & 1) === 1);
  setFunc(8, 8, ((fmt >>> 7) & 1) === 1);
  setFunc(7, 8, ((fmt >>> 8) & 1) === 1);
  for (let i = 9; i < 15; i += 1) setFunc(14 - i, 8, ((fmt >>> i) & 1) === 1);
  for (let i = 0; i < 8; i += 1) setFunc(n - 1 - i, 8, ((fmt >>> i) & 1) === 1);
  for (let i = 8; i < 15; i += 1) setFunc(8, n - 15 + i, ((fmt >>> i) & 1) === 1);
  setFunc(n - 8, 8, true);

  return modules;
}
