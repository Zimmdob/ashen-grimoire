// A tiny pixel painter: shaded volumes (spheres, capsules, polygons) lit from the upper left,
// hue-shifted colour ramps, ordered dithering, inner edges and a dark outer outline.
// Every creature is authored in a 32x32 space and painted at any resolution.

export type RGB = [number, number, number];

function hexRGB(h: string): RGB {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgb2hsl([r, g, b]: RGB): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function hsl2rgb(h: number, s: number, l: number): RGB {
  h = ((h % 360) + 360) % 360 / 360;
  if (s === 0) return [l * 255, l * 255, l * 255].map(Math.round) as RGB;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t: number) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)].map((v) => Math.round(v * 255)) as RGB;
}

const rampCache = new Map<string, RGB[]>();
/** Five shades from one colour: shadows drift cool, highlights drift warm, as painters do. */
export function ramp(base: string): RGB[] {
  let r = rampCache.get(base);
  if (r) return r;
  const [h, s, l] = rgb2hsl(hexRGB(base));
  let toWarm = 60 - h;
  toWarm = ((toWarm + 540) % 360) - 180;
  const dir = Math.sign(toWarm) || 1;
  r = [];
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    const li = Math.min(0.94, Math.max(0.035, l * (0.42 + 0.98 * t) + 0.07 * t * t));
    const si = Math.min(1, Math.max(0, s * (1.08 - 0.25 * Math.abs(t - 0.45)) * (t > 0.85 ? 0.85 : 1)));
    r.push(hsl2rgb(h + dir * (t - 0.5) * 2 * Math.min(14, Math.abs(toWarm) * 0.5), si, li));
  }
  rampCache.set(base, r);
  return r;
}
export const C = (h: string): RGB => hexRGB(h);

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16 - 0.5);
const LX = -0.48, LY = -0.62, LZ = 0.62;

export interface ShapeOpts { edge?: boolean; shade?: number; lift?: number; dither?: number }

export class Painter {
  readonly R: number;
  readonly k: number;
  private d: Uint8ClampedArray;
  private emis: Uint8Array;
  constructor(R: number) {
    this.R = R; this.k = R / 32;
    this.d = new Uint8ClampedArray(R * R * 4);
    this.emis = new Uint8Array(R * R);
  }
  private on(x: number, y: number) { return x >= 0 && y >= 0 && x < this.R && y < this.R; }
  put(x: number, y: number, c: RGB, emissive = false) {
    if (!this.on(x, y)) return;
    const i = (y * this.R + x) * 4;
    this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2]; this.d[i + 3] = 255;
    this.emis[y * this.R + x] = emissive ? 1 : 0;
  }
  filled(x: number, y: number) { return this.on(x, y) && this.d[(y * this.R + x) * 4 + 3] > 0; }

  /** Fill pixels inside a shape, shading each by a light value 0..1. */
  private fill(x0: number, y0: number, x1: number, y1: number, inside: (x: number, y: number) => boolean, light: (x: number, y: number) => number, rp: RGB[], o: ShapeOpts) {
    const edge = o.edge ?? true, dith = o.dither ?? 0.7, lift = o.lift ?? 0;
    const X0 = Math.max(0, Math.floor(x0)), Y0 = Math.max(0, Math.floor(y0)), X1 = Math.min(this.R - 1, Math.ceil(x1)), Y1 = Math.min(this.R - 1, Math.ceil(y1));
    for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) {
      const cx = x + 0.5, cy = y + 0.5;
      if (!inside(cx, cy)) continue;
      const v = Math.min(1, Math.max(0, (o.shade ?? light(cx, cy)) + lift));
      let idx = Math.round(v * (rp.length - 1) + BAYER[(y & 3) * 4 + (x & 3)] * dith);
      if (edge && !(inside(cx + 1, cy) && inside(cx - 1, cy) && inside(cx, cy + 1) && inside(cx, cy - 1))) idx = Math.min(idx, cy > (y0 + y1) / 2 || cx > (x0 + x1) / 2 + 2 ? 0 : 1);
      this.put(x, y, rp[Math.min(rp.length - 1, Math.max(0, idx))]);
    }
  }

  /** An ellipse lit as a dome (rot in radians). */
  blob(cx: number, cy: number, rx: number, ry: number, rp: RGB[], o: ShapeOpts & { rot?: number } = {}) {
    const k = this.k, X = cx * k, Y = cy * k, RX = rx * k, RY = ry * k, c = Math.cos(-(o.rot ?? 0)), s = Math.sin(-(o.rot ?? 0)), m = Math.max(RX, RY);
    const loc = (x: number, y: number) => { const dx = x - X, dy = y - Y; return [(dx * c - dy * s) / RX, (dx * s + dy * c) / RY]; };
    this.fill(X - m, Y - m, X + m, Y + m, (x, y) => { const [u, v] = loc(x, y); return u * u + v * v <= 1; }, (x, y) => {
      const [u, v] = loc(x, y), nz = Math.sqrt(Math.max(0, 1 - u * u - v * v));
      const nx = u * c + v * s, ny = -u * s + v * c;
      return 0.2 + 0.72 * (nx * LX + ny * LY + nz * LZ);
    }, rp, o);
  }

  /** A tapered capsule from (x0,y0) radius r0 to (x1,y1) radius r1, lit as a cylinder. */
  cap(x0: number, y0: number, x1: number, y1: number, r0: number, r1: number, rp: RGB[], o: ShapeOpts = {}) {
    const k = this.k, A = [x0 * k, y0 * k], B = [x1 * k, y1 * k], R0 = r0 * k, R1 = r1 * k;
    const dx = B[0] - A[0], dy = B[1] - A[1], L2 = dx * dx + dy * dy || 1;
    const near = (x: number, y: number) => {
      const t = Math.min(1, Math.max(0, ((x - A[0]) * dx + (y - A[1]) * dy) / L2));
      const px = A[0] + dx * t, py = A[1] + dy * t, r = R0 + (R1 - R0) * t;
      return { ox: x - px, oy: y - py, r };
    };
    const m = Math.max(R0, R1);
    this.fill(Math.min(A[0], B[0]) - m, Math.min(A[1], B[1]) - m, Math.max(A[0], B[0]) + m, Math.max(A[1], B[1]) + m,
      (x, y) => { const n = near(x, y); return n.ox * n.ox + n.oy * n.oy <= n.r * n.r; },
      (x, y) => { const n = near(x, y), nx = n.ox / n.r, ny = n.oy / n.r, nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny)); return 0.2 + 0.72 * (nx * LX + ny * LY + nz * LZ); }, rp, o);
  }

  /** A polygon (flat list of x,y), shaded by a gentle gradient toward the light. */
  poly(pts: number[], rp: RGB[], o: ShapeOpts = {}) {
    const k = this.k, P = pts.map((v) => v * k);
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (let i = 0; i < P.length; i += 2) { x0 = Math.min(x0, P[i]); x1 = Math.max(x1, P[i]); y0 = Math.min(y0, P[i + 1]); y1 = Math.max(y1, P[i + 1]); }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, sz = Math.max(x1 - x0, y1 - y0, 1);
    const inside = (x: number, y: number) => {
      let c = false;
      for (let i = 0, j = P.length - 2; i < P.length; j = i, i += 2) {
        if ((P[i + 1] > y) !== (P[j + 1] > y) && x < ((P[j] - P[i]) * (y - P[i + 1])) / (P[j + 1] - P[i + 1]) + P[i]) c = !c;
      }
      return c;
    };
    this.fill(x0, y0, x1, y1, inside, (x, y) => 0.55 + 0.9 * ((x - cx) * LX + (y - cy) * LY) / sz, rp, o);
  }

  /** A straight stroke of one colour (width in 32-space units). */
  line(x0: number, y0: number, x1: number, y1: number, c: RGB, w = 1, emissive = false) {
    const k = this.k, W = Math.max(1, Math.round(w * k)), n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * k * 1.5) + 1;
    for (let i = 0; i <= n; i++) {
      const x = Math.floor((x0 + ((x1 - x0) * i) / n) * k - (W - 1) / 2), y = Math.floor((y0 + ((y1 - y0) * i) / n) * k - (W - 1) / 2);
      for (let a = 0; a < W; a++) for (let b = 0; b < W; b++) this.put(x + a, y + b, c, emissive);
    }
  }
  /** One "pixel" of detail, sized to the resolution. */
  dot(x: number, y: number, c: RGB, s = 1, emissive = false) {
    const k = this.k, S = Math.max(1, Math.round(s * k));
    const X = Math.floor(x * k), Y = Math.floor(y * k);
    for (let a = 0; a < S; a++) for (let b = 0; b < S; b++) this.put(X + a, Y + b, c, emissive);
  }
  /** A glowing eye: a hot core and a softer halo pixel. */
  eye(x: number, y: number, c: string, s = 1) {
    const r = ramp(c);
    this.dot(x, y, r[4], s, true);
    if (s >= 1.5) this.dot(x + s * 0.5, y + s * 0.5, C('#ffffff'), s * 0.4, true);
  }

  /** Outline the silhouette and hand back a canvas. */
  canvas(): HTMLCanvasElement {
    const R = this.R, d = this.d, out = new Uint8ClampedArray(d);
    for (let y = 0; y < R; y++) for (let x = 0; x < R; x++) {
      const i = (y * R + x) * 4;
      if (d[i + 3]) continue;
      let n = -1;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < R && Y < R && d[(Y * R + X) * 4 + 3]) { n = (Y * R + X) * 4; break; } }
      if (n < 0) continue;
      out[i] = 10 + d[n] * 0.18; out[i + 1] = 8 + d[n + 1] * 0.14; out[i + 2] = 12 + d[n + 2] * 0.18; out[i + 3] = 255;
    }
    const c = document.createElement('canvas');
    c.width = c.height = R;
    c.getContext('2d')!.putImageData(new ImageData(out, R, R), 0, 0);
    return c;
  }
}
