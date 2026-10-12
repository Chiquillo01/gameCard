// Tiny pixel-art raster: layers, shapes with banded shading, ordered dithering, outlines, PNG out.
const zlib = require('zlib');
const fs = require('fs');

const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];
const bayer = (x, y) => (BAYER[y & 3][x & 3] + 0.5) / 16;

const hex = (h, a = 255) => {
  const n = parseInt(h.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
};
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

class Layer {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.px = new Uint8ClampedArray(w * h * 4);
  }
  get(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return [0, 0, 0, 0];
    const i = (y * this.w + x) * 4;
    return [this.px[i], this.px[i + 1], this.px[i + 2], this.px[i + 3]];
  }
  set(x, y, c) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || !c) return;
    const i = (y * this.w + x) * 4;
    const a = (c[3] ?? 255) / 255;
    if (a >= 1) {
      this.px[i] = c[0]; this.px[i + 1] = c[1]; this.px[i + 2] = c[2]; this.px[i + 3] = 255;
      return;
    }
    const da = this.px[i + 3] / 255;
    const oa = a + da * (1 - a);
    if (!oa) return;
    for (let k = 0; k < 3; k++) this.px[i + k] = (c[k] * a + this.px[i + k] * da * (1 - a)) / oa;
    this.px[i + 3] = oa * 255;
  }
  rect(x, y, w, h, c) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  }
  // Fill any shape given by an inside(x, y) test, colouring each pixel with paint(x, y, u, v).
  shape(x0, y0, x1, y1, inside, paint) {
    for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
      for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) {
        const r = inside(x + 0.5, y + 0.5);
        if (r) this.set(x, y, paint(x, y, r));
      }
    }
  }
  // Ellipse with 3-tone shading, light from the top-left, dithered between bands.
  ball(cx, cy, rx, ry, tones, { angle = 0 } = {}) {
    const ca = Math.cos(angle);
    const sa = Math.sin(angle);
    const R = Math.max(rx, ry) + 1;
    this.shape(cx - R, cy - R, cx + R, cy + R, (x, y) => {
      const dx = x - cx;
      const dy = y - cy;
      const u = (dx * ca + dy * sa) / rx;
      const v = (-dx * sa + dy * ca) / ry;
      return u * u + v * v <= 1 ? { u, v } : null;
    }, (x, y, { u, v }) => toneFor(tones, -(u * 0.6 + v * 0.8), x, y));
  }
  line(x0, y0, x1, y1, c, width = 1) {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2 + 1;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      if (width <= 1) this.set(x, y, c);
      else this.rect(Math.round(x - width / 2), Math.round(y - width / 2), width, width, c);
    }
  }
  poly(points, c) {
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    this.shape(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), (x, y) => {
      let inside = false;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [xi, yi] = points[i];
        const [xj, yj] = points[j];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
      return inside || null;
    }, typeof c === 'function' ? c : () => c);
  }
  // A dark line around everything opaque (the pixel-art outline).
  outline(c) {
    const out = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.get(x, y)[3] > 40) continue;
        if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => this.get(x + dx, y + dy)[3] > 140)) out.push([x, y]);
      }
    }
    out.forEach(([x, y]) => this.set(x, y, c));
  }
  draw(layer) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const c = layer.get(x, y);
      if (c[3]) this.set(x, y, c);
    }
  }
}

// Picks one of the tones for a light value in [-1, 1], dithering across band edges.
function toneFor(tones, light, x, y) {
  const n = tones.length;
  const t = Math.min(0.999, Math.max(0, (light + 1) / 2)) * (n - 1);
  const i = Math.floor(t);
  // Mostly flat bands, dithered only in a thin strip where two tones meet.
  const f = Math.min(1, Math.max(0, (t - i - 0.5) * 3 + 0.5));
  return f > bayer(x, y) ? tones[Math.min(n - 1, i + 1)] : tones[i];
}

// A soft light: concentric rings of stepped transparency (no dithering, so no dark speckle).
function glow(layer, cx, cy, r, color, maxAlpha = 110, steps = 4) {
  const c = hex(color);
  for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r;
    if (d > 1) continue;
    const level = Math.ceil((1 - d) * steps) / steps;
    layer.set(x, y, [c[0], c[1], c[2], Math.round(maxAlpha * level * 0.6)]);
  }
}

// Vertical gradient through colour stops, quantised and dithered.
function gradient(layer, stops, { y0 = 0, y1 = layer.h } = {}) {
  for (let y = y0; y < y1; y++) {
    const t = (y - y0) / Math.max(1, y1 - y0 - 1);
    const seg = Math.min(stops.length - 2, Math.floor(t * (stops.length - 1)));
    const local = t * (stops.length - 1) - seg;
    for (let x = 0; x < layer.w; x++) {
      const steps = 4;
      const q = Math.floor(local * steps + bayer(x, y)) / steps;
      layer.set(x, y, mix(stops[seg], stops[seg + 1], Math.min(1, q)));
    }
  }
}

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// --- PNG ---
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
// Scales the layer up by `scale` (nearest neighbour), crops to w x h, writes an RGB PNG.
function writePng(file, layer, scale, w, h) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const c = layer.get(Math.floor(x / scale), Math.floor(y / scale));
      const o = y * (w * 3 + 1) + 1 + x * 3;
      raw[o] = c[0]; raw[o + 1] = c[1]; raw[o + 2] = c[2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  fs.writeFileSync(file, png);
}

module.exports = { glow, Layer, hex, mix, gradient, toneFor, bayer, rng, writePng };
