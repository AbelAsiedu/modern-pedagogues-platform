/**
 * A small QR code generator: byte mode, error correction level M, versions 1 to 10 (up to 213 bytes).
 * It exists so the two-step sign-in page can show a scannable code without adding a dependency.
 * The layout, Reed-Solomon coding and masking follow ISO/IEC 18004; tests/unit/qr.test.ts checks the structure,
 * and the output was decoded with an independent QR reader while it was written.
 */

type Spec = { total: number; ecPerBlock: number; g1: [blocks: number, dataCw: number]; g2?: [blocks: number, dataCw: number] };

/** Level M block structure for versions 1-10 (ISO/IEC 18004 table 9). */
const SPECS: Record<number, Spec> = {
  1: { total: 26, ecPerBlock: 10, g1: [1, 16] },
  2: { total: 44, ecPerBlock: 16, g1: [1, 28] },
  3: { total: 70, ecPerBlock: 26, g1: [1, 44] },
  4: { total: 100, ecPerBlock: 18, g1: [2, 32] },
  5: { total: 134, ecPerBlock: 24, g1: [2, 43] },
  6: { total: 172, ecPerBlock: 16, g1: [4, 27] },
  7: { total: 196, ecPerBlock: 18, g1: [4, 31] },
  8: { total: 242, ecPerBlock: 22, g1: [2, 38], g2: [2, 39] },
  9: { total: 292, ecPerBlock: 22, g1: [3, 36], g2: [2, 37] },
  10: { total: 346, ecPerBlock: 26, g1: [4, 43], g2: [1, 44] },
};

const ALIGNMENT: Record<number, number[]> = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
  9: [6, 26, 46],
  10: [6, 28, 50],
};

export const QR_MAX_BYTES = 213;

// ---- Reed-Solomon over GF(256), polynomial 0x11D --------------------------------------------------------------

function gfMultiply(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

/** Coefficients of the generator polynomial of the given degree, highest power first, without the leading 1. */
function rsDivisor(degree: number): number[] {
  const result: number[] = new Array(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = gfMultiply(result[j]!, root);
      if (j + 1 < result.length) result[j]! ^= result[j + 1]!;
    }
    root = gfMultiply(root, 0x02);
  }
  return result;
}

function rsRemainder(data: number[], divisor: number[]): number[] {
  const result: number[] = new Array(divisor.length).fill(0);
  for (const b of data) {
    const factor = b ^ result.shift()!;
    result.push(0);
    divisor.forEach((coef, i) => {
      result[i]! ^= gfMultiply(coef, factor);
    });
  }
  return result;
}

// ---- Data encoding --------------------------------------------------------------------------------------------

function dataCodewords(spec: Spec): number {
  return spec.g1[0] * spec.g1[1] + (spec.g2 ? spec.g2[0] * spec.g2[1] : 0);
}

function chooseVersion(byteLength: number): number {
  for (let v = 1; v <= 10; v++) {
    const countBits = v <= 9 ? 8 : 16;
    if (4 + countBits + 8 * byteLength <= 8 * dataCodewords(SPECS[v]!)) return v;
  }
  throw new Error(`text is too long for this QR generator (${byteLength} bytes, maximum ${QR_MAX_BYTES})`);
}

function buildCodewords(bytes: Uint8Array, version: number): number[] {
  const spec = SPECS[version]!;
  const bits: number[] = [];
  const push = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  push(0b0100, 4); // byte mode
  push(bytes.length, version <= 9 ? 8 : 16);
  for (const b of bytes) push(b, 8);
  const capacityBits = 8 * dataCodewords(spec);
  push(0, Math.min(4, capacityBits - bits.length)); // terminator
  while (bits.length % 8 !== 0) bits.push(0);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let v = 0;
    for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j]!;
    data.push(v);
  }
  for (let pad = 0xec; data.length < dataCodewords(spec); pad ^= 0xec ^ 0x11) data.push(pad);

  // Split into blocks, add error correction to each, then interleave.
  const sizes: number[] = [];
  for (let i = 0; i < spec.g1[0]; i++) sizes.push(spec.g1[1]);
  if (spec.g2) for (let i = 0; i < spec.g2[0]; i++) sizes.push(spec.g2[1]);
  const divisor = rsDivisor(spec.ecPerBlock);
  const blocks: { data: number[]; ec: number[] }[] = [];
  let offset = 0;
  for (const size of sizes) {
    const chunk = data.slice(offset, offset + size);
    offset += size;
    blocks.push({ data: chunk, ec: rsRemainder(chunk, divisor) });
  }
  const out: number[] = [];
  const longest = Math.max(...sizes);
  for (let i = 0; i < longest; i++) for (const b of blocks) if (i < b.data.length) out.push(b.data[i]!);
  for (let i = 0; i < spec.ecPerBlock; i++) for (const b of blocks) out.push(b.ec[i]!);
  if (out.length !== spec.total) throw new Error("QR codeword count mismatch");
  return out;
}

// ---- Matrix ---------------------------------------------------------------------------------------------------

class Matrix {
  readonly size: number;
  readonly dark: boolean[][];
  readonly fixed: boolean[][];
  constructor(public readonly version: number) {
    this.size = 17 + 4 * version;
    this.dark = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false));
    this.fixed = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false));
  }
  setFunction(x: number, y: number, dark: boolean) {
    this.dark[y]![x] = dark;
    this.fixed[y]![x] = true;
  }
}

const bit = (value: number, i: number) => ((value >>> i) & 1) !== 0;

function drawFunctionPatterns(m: Matrix) {
  const { size, version } = m;
  for (let i = 0; i < size; i++) {
    m.setFunction(6, i, i % 2 === 0);
    m.setFunction(i, 6, i % 2 === 0);
  }
  const finder = (cx: number, cy: number) => {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && x < size && y >= 0 && y < size) m.setFunction(x, y, dist !== 2 && dist !== 4);
      }
    }
  };
  finder(3, 3);
  finder(size - 4, 3);
  finder(3, size - 4);

  const pos = ALIGNMENT[version]!;
  for (let i = 0; i < pos.length; i++) {
    for (let j = 0; j < pos.length; j++) {
      const overlapsFinder = (i === 0 && j === 0) || (i === 0 && j === pos.length - 1) || (i === pos.length - 1 && j === 0);
      if (overlapsFinder) continue;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) m.setFunction(pos[i]! + dx, pos[j]! + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  }
  drawFormat(m, 0); // reserve the format areas; redrawn with the real mask later
  if (version >= 7) {
    let rem = version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      m.setFunction(a, b, bit(bits, i));
      m.setFunction(b, a, bit(bits, i));
    }
  }
}

/** Level M is format value 0; 5 data bits (level + mask) plus 10 BCH bits, XORed with 0x5412. */
function drawFormat(m: Matrix, mask: number) {
  const { size } = m;
  const data = (0 << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const bits = ((data << 10) | rem) ^ 0x5412;
  for (let i = 0; i <= 5; i++) m.setFunction(8, i, bit(bits, i));
  m.setFunction(8, 7, bit(bits, 6));
  m.setFunction(8, 8, bit(bits, 7));
  m.setFunction(7, 8, bit(bits, 8));
  for (let i = 9; i < 15; i++) m.setFunction(14 - i, 8, bit(bits, i));
  for (let i = 0; i < 8; i++) m.setFunction(size - 1 - i, 8, bit(bits, i));
  for (let i = 8; i < 15; i++) m.setFunction(8, size - 15 + i, bit(bits, i));
  m.setFunction(8, size - 8, true); // the always-dark module
}

function placeData(m: Matrix, codewords: number[]) {
  const { size } = m;
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!m.fixed[y]![x] && i < codewords.length * 8) {
          m.dark[y]![x] = bit(codewords[i >>> 3]!, 7 - (i & 7));
          i++;
        }
      }
    }
  }
}

function applyMask(m: Matrix, mask: number) {
  for (let y = 0; y < m.size; y++) {
    for (let x = 0; x < m.size; x++) {
      let invert: boolean;
      switch (mask) {
        case 0: invert = (x + y) % 2 === 0; break;
        case 1: invert = y % 2 === 0; break;
        case 2: invert = x % 3 === 0; break;
        case 3: invert = (x + y) % 3 === 0; break;
        case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
        case 5: invert = ((x * y) % 2) + ((x * y) % 3) === 0; break;
        case 6: invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break;
        default: invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0; break;
      }
      if (!m.fixed[y]![x] && invert) m.dark[y]![x] = !m.dark[y]![x];
    }
  }
}

/** Penalty score from ISO/IEC 18004 section 7.8.3; the lowest-scoring mask scans most reliably. */
function penalty(m: Matrix): number {
  const { size, dark } = m;
  let score = 0;
  const line = (get: (i: number) => boolean) => {
    let run = 1;
    for (let i = 1; i < size; i++) {
      if (get(i) === get(i - 1)) {
        run++;
        if (run === 5) score += 3;
        else if (run > 5) score += 1;
      } else run = 1;
    }
    const s = Array.from({ length: size }, (_, i) => (get(i) ? 1 : 0)).join("");
    for (const pat of ["10111010000", "00001011101"]) {
      for (let i = s.indexOf(pat); i >= 0; i = s.indexOf(pat, i + 1)) score += 40;
    }
  };
  for (let y = 0; y < size; y++) line((i) => dark[y]![i]!);
  for (let x = 0; x < size; x++) line((i) => dark[i]![x]!);
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const c = dark[y]![x];
      if (c === dark[y]![x + 1] && c === dark[y + 1]![x] && c === dark[y + 1]![x + 1]) score += 3;
    }
  }
  let darkCount = 0;
  for (const row of dark) for (const c of row) if (c) darkCount++;
  const total = size * size;
  score += (Math.ceil(Math.abs(darkCount * 20 - total * 10) / total) - 1) * 10;
  return score;
}

/** The finished module grid: true = dark. */
export function qrModules(text: string): boolean[][] {
  const bytes = new TextEncoder().encode(text);
  const version = chooseVersion(bytes.length);
  const m = new Matrix(version);
  drawFunctionPatterns(m);
  placeData(m, buildCodewords(bytes, version));
  let best = 0;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    applyMask(m, mask);
    drawFormat(m, mask);
    const s = penalty(m);
    applyMask(m, mask); // undo
    if (s < bestScore) {
      bestScore = s;
      best = mask;
    }
  }
  applyMask(m, best);
  drawFormat(m, best);
  return m.dark;
}

/** An SVG image of the code with the required four-module quiet zone. Contains only numbers and path commands. */
export function qrSvg(text: string): { svg: string; modules: number } {
  const grid = qrModules(text);
  const n = grid.length;
  const quiet = 4;
  let d = "";
  for (let y = 0; y < n; y++) {
    let x = 0;
    while (x < n) {
      if (!grid[y]![x]) {
        x++;
        continue;
      }
      let w = 1;
      while (x + w < n && grid[y]![x + w]) w++;
      d += `M${x + quiet} ${y + quiet}h${w}v1h-${w}z`;
      x += w;
    }
  }
  const view = n + quiet * 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${view} ${view}" shape-rendering="crispEdges"><rect width="${view}" height="${view}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
  return { svg, modules: n };
}
