/**
 * Insert (or replace) a `pHYs` chunk in a PNG byte stream so apps that read
 * physical pixel dimensions (Word, InDesign, browsers' print preview) reflow
 * the image at the requested DPI.
 *
 * Walks PNG chunks after the 8-byte signature, skips any existing `pHYs`,
 * and inserts a freshly-computed `pHYs` immediately before the first `IDAT`.
 * The CRC table is generated lazily; no third-party dependency.
 */

const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PHYS = 0x70_48_59_73; // ASCII "pHYs"
const IDAT = 0x49_44_41_54; // ASCII "IDAT"

const METERS_PER_INCH = 39.3700787;

export const setPngDpi = (png: Uint8Array, dpi: number): Uint8Array => {
  if (!startsWith(png, PNG_SIGNATURE)) {
    throw new Error("setPngDpi: input is not a PNG (signature mismatch)");
  }
  const ppm = Math.round(dpi * METERS_PER_INCH);
  const newPhys = buildPhys(ppm);

  const out: Uint8Array[] = [PNG_SIGNATURE];
  let offset = PNG_SIGNATURE.length;
  let inserted = false;

  while (offset < png.length) {
    const len = readUint32(png, offset);
    const type = readUint32(png, offset + 4);
    const totalLen = 4 + 4 + len + 4; // length + type + data + crc

    if (type === PHYS) {
      // Drop existing pHYs; the freshly-built one replaces it.
      offset += totalLen;
      continue;
    }
    if (type === IDAT && !inserted) {
      out.push(newPhys);
      inserted = true;
    }
    out.push(png.subarray(offset, offset + totalLen));
    offset += totalLen;
  }
  if (!inserted) {
    // No IDAT found: malformed PNG, return original unchanged.
    return png;
  }
  return concat(out);
};

// --- helpers ---

const startsWith = (a: Uint8Array, b: Uint8Array): boolean => {
  if (a.length < b.length) return false;
  for (let i = 0; i < b.length; i++) if (a[i] !== b[i]) return false;
  return true;
};

const readUint32 = (b: Uint8Array, i: number): number =>
  (b[i]! << 24) | (b[i + 1]! << 16) | (b[i + 2]! << 8) | b[i + 3]!;

const writeUint32 = (b: Uint8Array, i: number, value: number): void => {
  b[i] = (value >>> 24) & 0xff;
  b[i + 1] = (value >>> 16) & 0xff;
  b[i + 2] = (value >>> 8) & 0xff;
  b[i + 3] = value & 0xff;
};

const buildPhys = (ppm: number): Uint8Array => {
  // pHYs payload = 4 (x ppm) + 4 (y ppm) + 1 (unit = 1 ≡ meters)
  const data = new Uint8Array(9);
  writeUint32(data, 0, ppm);
  writeUint32(data, 4, ppm);
  data[8] = 1;

  // length (4) + type (4) + data (9) + crc (4) = 21
  const chunk = new Uint8Array(21);
  writeUint32(chunk, 0, 9);
  // "pHYs"
  chunk[4] = 0x70;
  chunk[5] = 0x48;
  chunk[6] = 0x59;
  chunk[7] = 0x73;
  chunk.set(data, 8);
  const crc = crc32(chunk.subarray(4, 4 + 4 + 9));
  writeUint32(chunk, 4 + 4 + 9, crc);
  return chunk;
};

let CRC_TABLE: Uint32Array | null = null;
const getCrcTable = (): Uint32Array => {
  if (CRC_TABLE) return CRC_TABLE;
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xed_b8_83_20 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  CRC_TABLE = table;
  return table;
};

const crc32 = (bytes: Uint8Array): number => {
  const table = getCrcTable();
  let c = 0xff_ff_ff_ff;
  for (const byte of bytes) c = table[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xff_ff_ff_ff) >>> 0;
};

const concat = (parts: readonly Uint8Array[]): Uint8Array => {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let i = 0;
  for (const p of parts) {
    out.set(p, i);
    i += p.length;
  }
  return out;
};
