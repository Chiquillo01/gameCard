// Card illustrations for the cards that had none, drawn in code as pixel art.
// Usage: node tools/card-art/make.js frontend/public/assets/CardImg/generated [name-filter]
// The card's image field points at /assets/CardImg/generated/<file> (cards_final.json).
// Same frame as the rest of the game (423x308).
// Monsters, supports and tokens: 8-bit (chunky pixels, few tones). Compilaciones: 16-bit (finer
// pixels, more tones), matching the project's art tiers.
const path = require('path');
const { glow: softGlow, Layer, hex, mix, gradient, toneFor, bayer, rng, writePng } = require('./pixel');

const OUT = process.argv[2] || path.join(__dirname, 'out');
require('fs').mkdirSync(OUT, { recursive: true });
const W = 423;
const H = 308;
const TIERS = { bit8: { w: 71, h: 52, scale: 6 }, bit16: { w: 141, h: 103, scale: 3 } };
const OUTLINE = hex('#1a0f12');

// ---------- backgrounds ----------
function forest(L, seed, { sky = ['#bfe8c4', '#7fc4a4', '#3e7d6a'], ground = ['#5a8a3c', '#3f6a2a'] } = {}) {
  const r = rng(seed);
  gradient(L, sky.map((c) => hex(c)), { y1: Math.round(L.h * 0.8) });
  // far trees
  const far = hex('#2f5e4e');
  for (let i = 0; i < 9; i++) {
    const x = r() * L.w;
    const rr = L.h * (0.12 + r() * 0.1);
    L.ball(x, L.h * 0.55, rr, rr * 1.3, [far, far, far]);
    L.rect(Math.round(x - 1), Math.round(L.h * 0.55), Math.max(1, Math.round(L.w / 70)), Math.round(L.h * 0.3), hex('#2a4a3a'));
  }
  // light rays
  for (let i = 0; i < 3; i++) {
    const x0 = L.w * (0.15 + i * 0.25);
    L.poly([[x0, 0], [x0 + L.w * 0.07, 0], [x0 + L.w * 0.2, L.h * 0.8], [x0 + L.w * 0.13, L.h * 0.8]], hex('#f6ffd0', 46));
  }
  gradient(L, ground.map((c) => hex(c)), { y0: Math.round(L.h * 0.78) });
  for (let i = 0; i < 14; i++) {
    const x = r() * L.w;
    const y = L.h * (0.8 + r() * 0.18);
    L.line(x, y, x - 1, y - L.h * 0.05, hex('#7fb04a'));
    L.line(x + 1, y, x + 2, y - L.h * 0.06, hex('#6a9a3c'));
  }
}

function honeycomb(L) {
  gradient(L, [hex('#5a2e0a'), hex('#a8611a'), hex('#e8a83a')]);
  const s = L.w / 14;
  for (let row = -1; row < L.h / (s * 0.86) + 1; row++) {
    for (let col = -1; col < L.w / s + 1; col++) {
      const cx = col * s + (row % 2 ? s / 2 : 0);
      const cy = row * s * 0.86;
      const pts = Array.from({ length: 6 }, (_, k) => [cx + Math.cos((Math.PI / 3) * k + Math.PI / 6) * s * 0.5, cy + Math.sin((Math.PI / 3) * k + Math.PI / 6) * s * 0.5]);
      for (let k = 0; k < 6; k++) L.line(pts[k][0], pts[k][1], pts[(k + 1) % 6][0], pts[(k + 1) % 6][1], hex('#3a1c06', 150));
      if ((row * 7 + col * 3) % 5 === 0) L.poly(pts.map(([x, y]) => [cx + (x - cx) * 0.75, cy + (y - cy) * 0.75]), hex('#ffd25a', 110));
    }
  }
}

function sea(L, seed, { night = true } = {}) {
  const r = rng(seed);
  gradient(L, night ? [hex('#0b1530'), hex('#1d3a6b'), hex('#2f6b8f')] : [hex('#8fd3ff'), hex('#4aa0d8')], { y1: Math.round(L.h * 0.55) });
  if (night) for (let i = 0; i < 18; i++) L.set(r() * L.w, r() * L.h * 0.45, hex('#e8f4ff', 200));
  L.ball(L.w * 0.82, L.h * 0.16, L.h * 0.08, L.h * 0.08, [hex('#c9d6e8'), hex('#eef4ff'), hex('#ffffff')]);
  gradient(L, [hex('#1b4f7a'), hex('#0e2f52'), hex('#071a33')], { y0: Math.round(L.h * 0.55) });
  for (let i = 0; i < 26; i++) {
    const y = L.h * (0.58 + r() * 0.4);
    const x = r() * L.w;
    L.line(x, y, x + L.w * 0.06, y, hex('#5fa8d8', 160));
  }
}

function stoneWall(L, { light = '#e8a85a' } = {}) {
  gradient(L, [hex('#2a2230'), hex('#3b3040'), hex('#4a3a42')], { y1: Math.round(L.h * 0.78) });
  const bw = L.w / 8;
  const bh = L.h / 9;
  for (let row = 0; row < 8; row++) {
    for (let col = -1; col < 9; col++) {
      const x = col * bw + (row % 2 ? bw / 2 : 0);
      const y = row * bh;
      L.line(x, y, x + bw - 1, y, hex('#1e1824'));
      L.line(x, y, x, y + bh - 1, hex('#1e1824'));
      L.line(x + 1, y + 1, x + bw - 2, y + 1, hex('#5a4a52', 140));
    }
  }
  // torch glow
  softGlow(L, L.w * 0.12, L.h * 0.3, L.h * 0.28, light, 120);
  L.rect(Math.round(L.w * 0.115), Math.round(L.h * 0.3), Math.max(1, Math.round(L.w / 70)), Math.round(L.h * 0.12), hex('#5a3a22'));
  L.ball(L.w * 0.12, L.h * 0.27, L.h * 0.04, L.h * 0.06, [hex('#d8402a'), hex('#f8a030'), hex('#ffe680')]);
  gradient(L, [hex('#5a4636'), hex('#3a2c22')], { y0: Math.round(L.h * 0.78) });
}

function cave(L, glow) {
  gradient(L, [hex('#120c18'), hex('#22182c'), hex('#2c2034')]);
  const r = rng(7);
  for (let i = 0; i < 7; i++) {
    const x = r() * L.w;
    L.poly([[x - L.w * 0.04, 0], [x + L.w * 0.04, 0], [x, L.h * (0.12 + r() * 0.15)]], hex('#3a2c44'));
  }
  softGlow(L, L.w / 2, L.h * 0.55, L.h * 0.5, glow, 110);
  gradient(L, [hex('#3a2c3c'), hex('#241a28')], { y0: Math.round(L.h * 0.8) });
}

function sunset(L) {
  gradient(L, [hex('#2b1d4a'), hex('#8a3a5e'), hex('#e8784a'), hex('#f8c46a')], { y1: Math.round(L.h * 0.72) });
  L.ball(L.w * 0.72, L.h * 0.62, L.h * 0.18, L.h * 0.18, [hex('#f8a040'), hex('#ffd070'), hex('#fff0b0')]);
  // hills
  const r = rng(3);
  for (let i = 0; i < 5; i++) L.ball(r() * L.w, L.h * 0.78, L.w * 0.22, L.h * 0.16, [hex('#3a2236'), hex('#3a2236'), hex('#4a2c40')]);
  gradient(L, [hex('#5a3a2a'), hex('#3a2418')], { y0: Math.round(L.h * 0.76) });
}

// ---------- subjects ----------
const T = {
  yellow: [hex('#a8650c'), hex('#e8a51a'), hex('#ffd95a')],
  black: [hex('#120c0c'), hex('#2a2020'), hex('#4a3a34')],
  thorax: [hex('#4a2a10'), hex('#7a4a1c'), hex('#b07a3a')],
  eye: [hex('#0a3a22'), hex('#1e9a5a'), hex('#8af0b0')],
  leg: hex('#8a5a1c'),
  wing: hex('#cdf2ff', 120),
  wingEdge: hex('#ffffff', 190),
  gold: [hex('#8a5a08'), hex('#e8b020'), hex('#fff08a')],
  steel: [hex('#3a4450'), hex('#8a98a8'), hex('#e0e8f0')],
  wood: [hex('#4a2a14'), hex('#7a4a24'), hex('#a8703a')],
};

// A wasp facing left. (cx, cy): thorax; s: size in pixels.
function wasp(L, cx, cy, s, { crown = false, legs = true } = {}) {
  // wings behind
  L.ball(cx + s * 0.15, cy - s * 0.55, s * 0.55, s * 0.2, [T.wing, T.wing, T.wingEdge], { angle: -0.7 });
  L.ball(cx + s * 0.45, cy - s * 0.45, s * 0.5, s * 0.18, [T.wing, T.wing, T.wingEdge], { angle: -0.35 });
  // abdomen with stripes
  const ax = cx + s * 0.62;
  const ay = cy + s * 0.12;
  const rx = s * 0.58;
  const ry = s * 0.36;
  const ang = 0.35;
  L.shape(ax - rx - 2, ay - rx - 2, ax + rx + 2, ay + rx + 2, (x, y) => {
    const dx = x - ax;
    const dy = y - ay;
    const u = (dx * Math.cos(ang) + dy * Math.sin(ang)) / rx;
    const v = (-dx * Math.sin(ang) + dy * Math.cos(ang)) / ry;
    return u * u + v * v <= 1 ? { u, v } : null;
  }, (x, y, { u, v }) => {
    const stripe = Math.floor((u + 1) * 3.2) % 2 === 1;
    return toneFor(stripe ? T.black : T.yellow, -(u * 0.3 + v * 0.9), x, y);
  });
  // stinger
  const tipX = ax + Math.cos(ang) * rx;
  const tipY = ay + Math.sin(ang) * rx;
  L.poly([[tipX - s * 0.06, tipY - s * 0.06], [tipX + s * 0.2, tipY + s * 0.1], [tipX - s * 0.02, tipY + s * 0.08]], hex('#2a2020'));
  // legs
  if (legs) {
    for (let i = 0; i < 3; i++) {
      const lx = cx - s * 0.15 + i * s * 0.18;
      L.line(lx, cy + s * 0.15, lx - s * 0.12, cy + s * 0.42, T.leg, Math.max(1, Math.round(s / 18)));
      L.line(lx - s * 0.12, cy + s * 0.42, lx - s * 0.02, cy + s * 0.62, T.leg, Math.max(1, Math.round(s / 18)));
    }
  }
  // thorax and head
  L.ball(cx, cy, s * 0.3, s * 0.26, T.thorax);
  const hx = cx - s * 0.42;
  const hy = cy - s * 0.05;
  L.ball(hx, hy, s * 0.24, s * 0.24, T.yellow);
  L.ball(hx - s * 0.06, hy - s * 0.04, s * 0.13, s * 0.16, T.eye);
  L.set(hx - s * 0.1, hy - s * 0.12, hex('#ffffff'));
  // mandibles
  L.line(hx - s * 0.2, hy + s * 0.12, hx - s * 0.28, hy + s * 0.22, hex('#5a3a10'), Math.max(1, Math.round(s / 20)));
  // antennae
  L.line(hx - s * 0.05, hy - s * 0.2, hx - s * 0.25, hy - s * 0.55, hex('#2a2020'));
  L.line(hx - s * 0.25, hy - s * 0.55, hx - s * 0.42, hy - s * 0.58, hex('#2a2020'));
  L.line(hx + s * 0.05, hy - s * 0.22, hx - s * 0.08, hy - s * 0.6, hex('#2a2020'));
  if (crown) {
    const cyy = hy - s * 0.24;
    const pts = [[hx - s * 0.2, cyy], [hx - s * 0.2, cyy - s * 0.14], [hx - s * 0.12, cyy - s * 0.05], [hx, cyy - s * 0.18], [hx + s * 0.12, cyy - s * 0.05], [hx + s * 0.2, cyy - s * 0.14], [hx + s * 0.2, cyy]];
    L.poly(pts, (x, y) => toneFor(T.gold, -((x - hx) / s) * 2 - ((y - cyy) / s) * 4, x, y));
    L.set(hx, cyy - s * 0.1, hex('#e8203a'));
  }
}

function bow(L, x, y, s) {
  for (let a = -1.2; a <= 1.2; a += 0.02) L.set(x - Math.cos(a) * s * 0.35, y + Math.sin(a) * s * 0.55, T.wood[1]);
  L.line(x - Math.cos(1.2) * s * 0.35, y - Math.sin(1.2) * s * 0.55, x - Math.cos(1.2) * s * 0.35, y + Math.sin(1.2) * s * 0.55, hex('#e8e0c8'));
  L.line(x - s * 0.12, y, x - s * 0.9, y, hex('#c8a060'));
  L.poly([[x - s * 0.9, y - s * 0.06], [x - s * 1.05, y], [x - s * 0.9, y + s * 0.06]], T.steel[1]);
}

function shield(L, x, y, s) {
  L.ball(x, y, s * 0.32, s * 0.4, T.steel);
  L.ball(x, y, s * 0.2, s * 0.26, T.gold);
  // hexagon emblem
  const pts = Array.from({ length: 6 }, (_, k) => [x + Math.cos((Math.PI / 3) * k) * s * 0.1, y + Math.sin((Math.PI / 3) * k) * s * 0.1]);
  L.poly(pts, hex('#5a2e0a'));
}

function lance(L, x0, y0, x1, y1, s) {
  L.line(x0, y0, x1, y1, T.wood[1], Math.max(1, Math.round(s / 14)));
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  const ux = dx / len;
  const uy = dy / len;
  L.poly([[x1 - uy * s * 0.08, y1 + ux * s * 0.08], [x1 + ux * s * 0.28, y1 + uy * s * 0.28], [x1 + uy * s * 0.08, y1 - ux * s * 0.08]], (x, y) => toneFor(T.steel, (x - x1) / s, x, y));
}

function bandit(L, cx, cy, s) {
  const coat = [hex('#3a1a1a'), hex('#6a2a22'), hex('#9a4a32')];
  const skin = [hex('#8a5a3a'), hex('#c88a5a'), hex('#f0b888')];
  // legs and boots
  L.rect(Math.round(cx - s * 0.18), Math.round(cy + s * 0.35), Math.round(s * 0.14), Math.round(s * 0.4), hex('#2a2030'));
  L.rect(Math.round(cx + s * 0.04), Math.round(cy + s * 0.35), Math.round(s * 0.14), Math.round(s * 0.4), hex('#2a2030'));
  L.rect(Math.round(cx - s * 0.22), Math.round(cy + s * 0.7), Math.round(s * 0.2), Math.round(s * 0.1), hex('#1a1210'));
  L.rect(Math.round(cx + s * 0.02), Math.round(cy + s * 0.7), Math.round(s * 0.2), Math.round(s * 0.1), hex('#1a1210'));
  // coat
  L.poly([[cx - s * 0.32, cy - s * 0.15], [cx + s * 0.32, cy - s * 0.15], [cx + s * 0.4, cy + s * 0.5], [cx - s * 0.4, cy + s * 0.5]], (x, y) => toneFor(coat, -((x - cx) / s) * 2.5, x, y));
  L.rect(Math.round(cx - s * 0.33), Math.round(cy + s * 0.18), Math.round(s * 0.66), Math.max(1, Math.round(s * 0.06)), hex('#1a1210'));
  L.rect(Math.round(cx - s * 0.04), Math.round(cy + s * 0.17), Math.round(s * 0.08), Math.round(s * 0.08), T.gold[1]);
  // arm with sabre
  L.line(cx + s * 0.3, cy - s * 0.05, cx + s * 0.55, cy + s * 0.2, coat[1], Math.max(2, Math.round(s / 8)));
  L.line(cx + s * 0.58, cy + s * 0.2, cx + s * 0.95, cy - s * 0.45, T.steel[2], Math.max(1, Math.round(s / 16)));
  L.line(cx + s * 0.5, cy + s * 0.25, cx + s * 0.66, cy + s * 0.14, T.gold[1], Math.max(1, Math.round(s / 16)));
  // head
  L.ball(cx, cy - s * 0.35, s * 0.2, s * 0.22, skin);
  L.ball(cx, cy - s * 0.22, s * 0.17, s * 0.1, [hex('#2a1810'), hex('#3a2418'), hex('#4a3020')]); // beard
  L.rect(Math.round(cx - s * 0.14), Math.round(cy - s * 0.42), Math.round(s * 0.28), Math.max(1, Math.round(s * 0.04)), hex('#1a1210')); // eyepatch band
  L.ball(cx - s * 0.07, cy - s * 0.39, s * 0.05, s * 0.05, [hex('#0a0a0a'), hex('#1a1a1a'), hex('#2a2a2a')]);
  L.set(cx + s * 0.07, cy - s * 0.39, hex('#ffffff'));
  // tricorn hat
  const hatTones = [hex('#120c10'), hex('#2a2028'), hex('#4a3a44')];
  L.ball(cx, cy - s * 0.6, s * 0.2, s * 0.14, hatTones); // crown of the hat
  L.poly([[cx - s * 0.44, cy - s * 0.66], [cx - s * 0.22, cy - s * 0.5], [cx + s * 0.22, cy - s * 0.5], [cx + s * 0.44, cy - s * 0.66], [cx + s * 0.28, cy - s * 0.58], [cx - s * 0.28, cy - s * 0.58]], (x, y) => toneFor(hatTones, -((x - cx) / s) * 2, x, y)); // upturned brim
  L.line(cx - s * 0.22, cy - s * 0.5, cx + s * 0.22, cy - s * 0.5, T.gold[1]);
  L.ball(cx + s * 0.06, cy - s * 0.66, s * 0.05, s * 0.05, [hex('#e8e0d0'), hex('#ffffff'), hex('#ffffff')]); // skull badge
}

function tentacle(L, x0, y0, s) {
  const pts = [];
  for (let t = 0; t <= 1; t += 0.01) {
    pts.push([x0 + Math.sin(t * 3.2) * s * 0.55 - t * s * 0.2, y0 - t * s * 1.6, (1 - t * 0.85) * s * 0.28]);
  }
  const tones = [hex('#3a1450'), hex('#7a2a8a'), hex('#c060c0')];
  pts.forEach(([x, y, r]) => L.ball(x, y, r, r, tones));
  // suckers
  pts.filter((_, i) => i % 9 === 4 && i < 85).forEach(([x, y, r]) => L.ball(x + r * 0.55, y, r * 0.32, r * 0.32, [hex('#d8a0c8'), hex('#f0c8e0'), hex('#fff0f8')]));
  // splash
  for (let i = 0; i < 5; i++) L.ball(x0 + (i - 2) * s * 0.16, y0 + s * 0.02 + (i % 2) * s * 0.03, s * 0.07, s * 0.04, [hex('#9ad0f0'), hex('#c8ecff'), hex('#ffffff')]);
}

function ballista(L, cx, cy, s) {
  // base and wheels
  L.rect(Math.round(cx - s * 0.6), Math.round(cy + s * 0.25), Math.round(s * 1.2), Math.round(s * 0.18), T.wood[0]);
  L.ball(cx - s * 0.42, cy + s * 0.48, s * 0.18, s * 0.18, T.wood);
  L.ball(cx + s * 0.42, cy + s * 0.48, s * 0.18, s * 0.18, T.wood);
  L.ball(cx - s * 0.42, cy + s * 0.48, s * 0.05, s * 0.05, T.steel);
  L.ball(cx + s * 0.42, cy + s * 0.48, s * 0.05, s * 0.05, T.steel);
  // stock
  L.poly([[cx - s * 0.75, cy - s * 0.02], [cx + s * 0.5, cy - s * 0.12], [cx + s * 0.55, cy + s * 0.05], [cx - s * 0.7, cy + s * 0.14]], (x, y) => toneFor(T.wood, -((y - cy) / s) * 6, x, y));
  L.line(cx - s * 0.1, cy + s * 0.08, cx - s * 0.1, cy + s * 0.28, T.wood[0], Math.max(1, Math.round(s / 10)));
  // bow arms
  for (let a = -1.25; a <= 1.25; a += 0.01) L.set(cx + s * 0.38 - Math.cos(a) * s * 0.18, cy - s * 0.03 + Math.sin(a) * s * 0.6, T.wood[2]);
  L.line(cx + s * 0.38 - Math.cos(1.25) * s * 0.18, cy - s * 0.03 - Math.sin(1.25) * s * 0.6, cx + s * 0.02, cy - s * 0.05, hex('#e8e0c8'));
  L.line(cx + s * 0.38 - Math.cos(1.25) * s * 0.18, cy - s * 0.03 + Math.sin(1.25) * s * 0.6, cx + s * 0.02, cy - s * 0.05, hex('#e8e0c8'));
  // bolt
  L.line(cx - s * 0.45, cy - s * 0.04, cx + s * 0.8, cy - s * 0.18, hex('#c8a060'), Math.max(1, Math.round(s / 18)));
  L.poly([[cx + s * 0.78, cy - s * 0.25], [cx + s * 0.98, cy - s * 0.2], [cx + s * 0.8, cy - s * 0.1]], T.steel[1]);
  // gear emblem
  L.ball(cx + s * 0.1, cy + s * 0.34, s * 0.07, s * 0.07, T.gold);
}

function chest(L, cx, cy, s) {
  // coins spilling
  const r = rng(11);
  for (let i = 0; i < 16; i++) L.ball(cx + (r() - 0.5) * s * 1.6, cy + s * 0.5 + r() * s * 0.12, s * 0.07, s * 0.04, T.gold);
  // box
  L.rect(Math.round(cx - s * 0.55), Math.round(cy), Math.round(s * 1.1), Math.round(s * 0.5), T.wood[1]);
  L.rect(Math.round(cx - s * 0.55), Math.round(cy + s * 0.38), Math.round(s * 1.1), Math.round(s * 0.12), T.wood[0]);
  // open lid
  L.poly([[cx - s * 0.55, cy], [cx + s * 0.55, cy], [cx + s * 0.6, cy - s * 0.45], [cx - s * 0.5, cy - s * 0.45]], (x, y) => toneFor(T.wood, -((y - cy) / s) * 3 - 1, x, y));
  // gold inside, glowing
  L.ball(cx, cy, s * 0.5, s * 0.14, T.gold);
  for (let i = 0; i < 6; i++) L.ball(cx + (i - 2.5) * s * 0.16, cy - s * 0.06, s * 0.07, s * 0.07, T.gold);
  L.ball(cx + s * 0.18, cy - s * 0.12, s * 0.08, s * 0.08, [hex('#7a0a2a'), hex('#d8203a'), hex('#ff8aa0')]);
  // straps and lock
  [-0.35, 0.35].forEach((f) => L.rect(Math.round(cx + f * s - s * 0.04), Math.round(cy - s * 0.45), Math.max(1, Math.round(s * 0.08)), Math.round(s * 0.95), T.steel[1]));
  L.rect(Math.round(cx - s * 0.07), Math.round(cy + s * 0.08), Math.round(s * 0.14), Math.round(s * 0.14), T.gold[1]);
  // sparkles
  for (let i = 0; i < 6; i++) {
    const x = cx + (r() - 0.5) * s * 1.3;
    const y = cy - s * (0.3 + r() * 0.5);
    L.set(x, y, hex('#fff8c0'));
    L.set(x + 1, y, hex('#fff8c0', 140));
    L.set(x - 1, y, hex('#fff8c0', 140));
    L.set(x, y + 1, hex('#fff8c0', 140));
    L.set(x, y - 1, hex('#fff8c0', 140));
  }
}

function pearl(L, cx, cy, s, tones, glow) {
  // clam shell
  const shell = [hex('#8a6a7a'), hex('#d8b8c0'), hex('#fff0f0')];
  const half = (ox, oy, rx, ry, lower) => L.shape(ox - rx, oy - ry, ox + rx, oy + ry, (x, y) => {
    const u = (x - ox) / rx;
    const v = (y - oy) / ry;
    return u * u + v * v <= 1 && (lower ? v >= 0 : v <= 0) ? { u, v } : null;
  }, (x, y, { u, v }) => {
    const ridge = Math.floor((Math.atan2(v, u) + Math.PI) * 4) % 2;
    return toneFor(shell, -(u * 0.5) + (ridge ? 0.25 : -0.25), x, y);
  });
  half(cx, cy - s * 0.1, s * 0.78, s * 0.75, false); // lid, open behind the pearl
  half(cx, cy + s * 0.25, s * 0.8, s * 0.32, true); // bowl
  L.ball(cx, cy + s * 0.25, s * 0.72, s * 0.08, [hex('#5a3a4a'), hex('#7a5a6a'), hex('#9a7a8a')]); // inside lip
  // glow and pearl
  softGlow(L, cx, cy, s * 0.75, glow, 160);
  L.ball(cx, cy + s * 0.05, s * 0.3, s * 0.3, tones);
  L.ball(cx - s * 0.1, cy - s * 0.06, s * 0.07, s * 0.07, [hex('#ffffff', 150), hex('#ffffff', 220), hex('#ffffff')]);
}

// ---------- cards ----------
const CARDS = [
  {
    file: 'avispa-reina.png', tier: 'bit16',
    draw(bg, fg) {
      honeycomb(bg);
      softGlow(bg, bg.w * 0.46, bg.h * 0.48, bg.h * 0.55, '#fff6c8', 140);
      wasp(fg, fg.w * 0.42, fg.h * 0.52, fg.h * 0.46, { crown: true });
    },
  },
  {
    file: 'avispa-arquera.png', tier: 'bit16',
    draw(bg, fg) {
      forest(bg, 21);
      wasp(fg, fg.w * 0.5, fg.h * 0.52, fg.h * 0.42);
      bow(fg, fg.w * 0.3, fg.h * 0.56, fg.h * 0.42);
    },
  },
  {
    file: 'avispa-de-respaldo.png', tier: 'bit8',
    draw(bg, fg) {
      forest(bg, 33, { sky: ['#cfe8b0', '#8ac08a', '#4a7a5a'] });
      wasp(fg, fg.w * 0.5, fg.h * 0.5, fg.h * 0.44);
      shield(fg, fg.w * 0.27, fg.h * 0.62, fg.h * 0.46);
    },
  },
  {
    file: 'avispa-de-batalla.png', tier: 'bit8',
    draw(bg, fg) {
      forest(bg, 44, { sky: ['#f0d8a0', '#c89a6a', '#7a5a4a'] });
      wasp(fg, fg.w * 0.5, fg.h * 0.5, fg.h * 0.44);
      lance(fg, fg.w * 0.58, fg.h * 0.8, fg.w * 0.14, fg.h * 0.4, fg.h * 0.46);
    },
  },
  {
    file: 'capitan-bandido.png', tier: 'bit8',
    draw(bg, fg) {
      sunset(bg);
      bandit(fg, fg.w * 0.42, fg.h * 0.5, fg.h * 0.56);
    },
  },
  {
    file: 'tentaculo-musculoso.png', tier: 'bit8',
    draw(bg, fg) {
      sea(bg, 5);
      tentacle(fg, fg.w * 0.5, fg.h * 0.88, fg.h * 0.55);
    },
  },
  {
    file: 'token-de-balista.png', tier: 'bit8',
    draw(bg, fg) {
      stoneWall(bg);
      ballista(fg, fg.w * 0.48, fg.h * 0.5, fg.h * 0.6);
    },
  },
  {
    file: 'token-del-tesoro.png', tier: 'bit8',
    draw(bg, fg) {
      cave(bg, '#f8d060');
      chest(fg, fg.w * 0.5, fg.h * 0.52, fg.h * 0.55);
    },
  },
  {
    file: 'perla-de-hielo.png', tier: 'bit8',
    draw(bg, fg) {
      gradient(bg, [hex('#0e2a4a'), hex('#2a6a9a'), hex('#8ad0f0')]);
      pearl(fg, fg.w * 0.5, fg.h * 0.5, fg.h * 0.45, [hex('#5aa0d8'), hex('#a8e0ff'), hex('#f0ffff')], '#c8f0ff');
    },
  },
  {
    file: 'perla-oscura.png', tier: 'bit8',
    draw(bg, fg) {
      gradient(bg, [hex('#0a0614'), hex('#24123a'), hex('#4a2a6a')]);
      pearl(fg, fg.w * 0.5, fg.h * 0.5, fg.h * 0.45, [hex('#1a0a2a'), hex('#5a2a8a'), hex('#b080e8')], '#9a5ad8');
    },
  },
  {
    file: 'perla-de-fuego.png', tier: 'bit8',
    draw(bg, fg) {
      gradient(bg, [hex('#2a0a06'), hex('#7a1a0a'), hex('#e8602a')]);
      pearl(fg, fg.w * 0.5, fg.h * 0.5, fg.h * 0.45, [hex('#a8200a'), hex('#f8702a'), hex('#ffe08a')], '#ffb040');
    },
  },
];

const only = process.argv[3];
CARDS.filter((c) => !only || c.file.includes(only)).forEach((card) => {
  const { w, h, scale } = TIERS[card.tier];
  const bg = new Layer(w, h);
  const fg = new Layer(w, h);
  card.draw(bg, fg);
  fg.outline(OUTLINE);
  bg.draw(fg);
  writePng(path.join(OUT, card.file), bg, scale, W, H);
  console.log('wrote', card.file);
});
