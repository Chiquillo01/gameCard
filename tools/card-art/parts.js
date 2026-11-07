// Reusable pixel-art pieces for the card illustrations: backgrounds, figures, creatures, objects.
// Every subject takes (L, cx, cy, s, opts): a layer, a centre, and a size in pixels.
const { glow: softGlow, hex, gradient, toneFor, rng } = require('./pixel');

const t3 = (a, b, c) => [hex(a), hex(b), hex(c)];
const P = {
  skin: t3('#8a5a3a', '#c88a5a', '#f0b888'),
  pale: t3('#a87a6a', '#e8c0a8', '#fff0e0'),
  goblin: t3('#2e5a1a', '#5a9a2a', '#a8d85a'),
  orc: t3('#2a3a1a', '#5a6a32', '#8a9a5a'),
  bone: t3('#8a8070', '#d8d0b8', '#fffaf0'),
  steel: t3('#3a4450', '#8a98a8', '#e0e8f0'),
  dark: t3('#120c14', '#2a2030', '#4a3a50'),
  gold: t3('#8a5a08', '#e8b020', '#fff08a'),
  wood: t3('#4a2a14', '#7a4a24', '#a8703a'),
  red: t3('#5a0a0a', '#b81a1a', '#ff6a5a'),
  blood: t3('#3a0206', '#8a0a14', '#d8303a'),
  blue: t3('#12305a', '#2a6ab0', '#7ab8f0'),
  ice: t3('#3a7ab0', '#9ad8f8', '#f0ffff'),
  purple: t3('#2a1040', '#6a2a9a', '#b070e8'),
  green: t3('#1a4a1a', '#3a8a32', '#8ad05a'),
  teal: t3('#0a3a3a', '#1a8a7a', '#6ad8c0'),
  brown: t3('#3a2414', '#6a4426', '#9a6a3e'),
  fire: t3('#a8200a', '#f8702a', '#ffe08a'),
  white: t3('#9aa0b0', '#e0e4f0', '#ffffff'),
  pink: t3('#8a2a5a', '#e06a9a', '#ffc0d8'),
  leaf: t3('#1e4a1e', '#3a8a32', '#8ad05a'),
  bark: t3('#3a2414', '#6a4426', '#9a6a3e'),
  moss: t3('#2a4a2a', '#4a7a3a', '#7aa85a'),
  orange: t3('#8a3a08', '#e87a1a', '#ffc070'),
  grey: t3('#2a2a30', '#5a5a64', '#9a9aa8'),
};

const W1 = (s, k = 16) => Math.max(1, Math.round(s / k));
// Shades a polygon from the left (light) to the right (shadow) around x = cx.
const side = (tones, cx, s, k = 2.5) => (x, y) => toneFor(tones, -((x - cx) / s) * k, x, y);
const star = (L, x, y, c = '#fffbe0') => {
  L.set(x, y, hex(c));
  [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => L.set(x + dx, y + dy, hex(c, 130)));
};

// ---------- backgrounds ----------
function plain(L, stops) { gradient(L, stops.map((c) => hex(c))); }

function sky(L, seed = 1, stops = ['#5aa8e8', '#9ad0f8', '#e0f4ff']) {
  gradient(L, stops.map((c) => hex(c)), { y1: Math.round(L.h * 0.8) });
  const r = rng(seed);
  for (let i = 0; i < 5; i++) {
    const x = r() * L.w;
    const y = L.h * (0.1 + r() * 0.4);
    for (let k = 0; k < 4; k++) L.ball(x + k * L.w * 0.04, y + (k % 2) * 2, L.w * 0.05, L.h * 0.05, t3('#d8e8f8', '#f0f8ff', '#ffffff'));
  }
  gradient(L, [hex('#6aa84a'), hex('#4a8a32')], { y0: Math.round(L.h * 0.8) });
}

function night(L, seed = 2, { moon = true, color = '#e8eef8' } = {}) {
  gradient(L, [hex('#060818'), hex('#141a3a'), hex('#2a2a5a')]);
  const r = rng(seed);
  for (let i = 0; i < 26; i++) L.set(r() * L.w, r() * L.h * 0.7, hex('#ffffff', 120 + Math.round(r() * 130)));
  if (moon) {
    softGlow(L, L.w * 0.75, L.h * 0.25, L.h * 0.3, color, 90);
    L.ball(L.w * 0.75, L.h * 0.25, L.h * 0.13, L.h * 0.13, t3('#a8b0c8', '#e0e8f8', '#ffffff'));
  }
}

function darkForest(L, seed = 3, { eyes = true, fog = '#7a9a8a' } = {}) {
  const r = rng(seed);
  gradient(L, [hex('#0a120e'), hex('#14261c'), hex('#22382a')], { y1: Math.round(L.h * 0.82) });
  softGlow(L, L.w * 0.5, L.h * 0.35, L.h * 0.5, '#4a7a6a', 70);
  for (let i = 0; i < 10; i++) {
    const x = r() * L.w;
    const w = Math.max(2, Math.round(L.w * (0.03 + r() * 0.04)));
    L.rect(Math.round(x), 0, w, Math.round(L.h * 0.85), hex(i % 2 ? '#0e1a14' : '#16241c'));
    L.line(x + w, L.h * 0.3, x + w + L.w * 0.08, L.h * 0.15, hex('#0e1a14'), Math.max(1, Math.round(w / 2)));
  }
  gradient(L, [hex('#1a2a1e'), hex('#0e1810')], { y0: Math.round(L.h * 0.82) });
  for (let i = 0; i < 4; i++) L.ball(r() * L.w, L.h * (0.78 + r() * 0.1), L.w * 0.25, L.h * 0.05, [hex(fog, 50), hex(fog, 60), hex(fog, 70)]);
  if (eyes) for (let i = 0; i < 3; i++) {
    const x = r() * L.w; const y = L.h * (0.3 + r() * 0.35);
    L.set(x, y, hex('#f8e040')); L.set(x + 2, y, hex('#f8e040'));
  }
}

function underwater(L, seed = 4, stops = ['#2a7ab0', '#155a8a', '#0a2a4a']) {
  gradient(L, stops.map((c) => hex(c)));
  const r = rng(seed);
  for (let i = 0; i < 3; i++) {
    const x0 = L.w * (0.15 + i * 0.3);
    L.poly([[x0, 0], [x0 + L.w * 0.06, 0], [x0 + L.w * 0.16, L.h], [x0 + L.w * 0.1, L.h]], hex('#c8f0ff', 30));
  }
  for (let i = 0; i < 10; i++) {
    const x = r() * L.w; const y = r() * L.h;
    L.set(x, y, hex('#d8f8ff', 170));
  }
  for (let i = 0; i < 6; i++) {
    const x = r() * L.w;
    const h = L.h * (0.15 + r() * 0.2);
    for (let k = 0; k < h; k++) L.set(x + Math.sin(k * 0.5) * 1.2, L.h - k, hex('#2a7a4a'));
  }
  gradient(L, [hex('#c8a870'), hex('#8a7048')], { y0: Math.round(L.h * 0.9) });
}

function library(L, { light = '#ffd890' } = {}) {
  gradient(L, [hex('#1e120c'), hex('#2e1e14'), hex('#3a2818')]);
  const shelfH = L.h / 4;
  const r = rng(9);
  const colors = ['#7a1a1a', '#1a3a7a', '#2a6a2a', '#8a6a1a', '#5a2a6a', '#8a3a1a'];
  for (let row = 0; row < 4; row++) {
    const y = row * shelfH;
    let x = 0;
    while (x < L.w) {
      const bw = 1 + Math.round(r() * 2);
      const bh = shelfH * (0.55 + r() * 0.3);
      L.rect(Math.round(x), Math.round(y + shelfH - bh - 1), bw, Math.round(bh), hex(colors[Math.floor(r() * colors.length)]));
      x += bw + (r() < 0.2 ? 1 : 0);
    }
    L.rect(0, Math.round(y + shelfH - 1), L.w, Math.max(1, Math.round(L.h / 40)), hex('#5a3a1e'));
  }
  softGlow(L, L.w * 0.5, L.h * 0.45, L.h * 0.55, light, 110);
}

function swamp(L, seed = 5) {
  darkForest(L, seed, { eyes: false, fog: '#8aaa6a' });
  gradient(L, [hex('#2a3a1a'), hex('#1a2a12')], { y0: Math.round(L.h * 0.72) });
  const r = rng(seed + 1);
  for (let i = 0; i < 12; i++) L.line(r() * L.w, L.h * (0.75 + r() * 0.22), r() * L.w, L.h * (0.75 + r() * 0.22), hex('#4a6a2a', 120));
  for (let i = 0; i < 5; i++) L.ball(r() * L.w, L.h * (0.8 + r() * 0.12), L.w * 0.03, L.h * 0.02, t3('#3a5a1a', '#5a8a2a', '#8aba4a'));
}

function lavaField(L) {
  gradient(L, [hex('#1a0606'), hex('#4a0e0a'), hex('#a82a0a')], { y1: Math.round(L.h * 0.75) });
  gradient(L, [hex('#3a1208'), hex('#1a0806')], { y0: Math.round(L.h * 0.75) });
  const r = rng(13);
  for (let i = 0; i < 6; i++) L.line(r() * L.w, L.h * (0.78 + r() * 0.2), r() * L.w, L.h * (0.78 + r() * 0.2), hex('#f8802a'));
  for (let i = 0; i < 14; i++) L.set(r() * L.w, r() * L.h * 0.7, hex('#ffb040', 200));
}

function snow(L, seed = 6) {
  gradient(L, [hex('#5a7aa8'), hex('#a8c8e8'), hex('#e0f0ff')], { y1: Math.round(L.h * 0.75) });
  const r = rng(seed);
  for (let i = 0; i < 4; i++) {
    const x = r() * L.w;
    L.poly([[x - L.w * 0.2, L.h * 0.78], [x, L.h * (0.3 + r() * 0.2)], [x + L.w * 0.2, L.h * 0.78]], (px, py) => toneFor(t3('#8aa0c0', '#c8d8f0', '#ffffff'), -((px - x) / L.w) * 6, px, py));
  }
  gradient(L, [hex('#e8f4ff'), hex('#c8dcf0')], { y0: Math.round(L.h * 0.76) });
  for (let i = 0; i < 24; i++) L.set(r() * L.w, r() * L.h, hex('#ffffff', 220));
}

function meadow(L, seed = 7) {
  sky(L, seed, ['#7ab8e8', '#b8e0f8', '#f0f8e0']);
  const r = rng(seed);
  for (let i = 0; i < 4; i++) L.ball(r() * L.w, L.h * 0.82, L.w * 0.3, L.h * 0.12, t3('#3a7a2a', '#5a9a3a', '#7aba4a'));
}

function castleHill(L, seed = 8, { stops = ['#f0a86a', '#f8d8a0', '#fff4d8'], stone = '#8a8070' } = {}) {
  gradient(L, stops.map((c) => hex(c)), { y1: Math.round(L.h * 0.8) });
  const c = hex(stone);
  const base = L.h * 0.62;
  L.rect(Math.round(L.w * 0.62), Math.round(base - L.h * 0.12), Math.round(L.w * 0.3), Math.round(L.h * 0.2), c);
  [0.62, 0.72, 0.84].forEach((f, i) => {
    L.rect(Math.round(L.w * f), Math.round(base - L.h * (0.25 + (i % 2) * 0.08)), Math.round(L.w * 0.07), Math.round(L.h * 0.3), c);
    L.poly([[L.w * (f - 0.01), base - L.h * (0.25 + (i % 2) * 0.08)], [L.w * (f + 0.035), base - L.h * (0.36 + (i % 2) * 0.08)], [L.w * (f + 0.08), base - L.h * (0.25 + (i % 2) * 0.08)]], hex('#5a2a3a'));
  });
  L.ball(L.w * 0.5, L.h * 0.88, L.w * 0.7, L.h * 0.22, t3('#3a6a2a', '#4a8a3a', '#6aaa4a'));
}

// ---------- figures ----------
function wings(L, x, y, s, kind, tones) {
  if (kind === 'bat') {
    const c = tones || P.dark;
    [-1, 1].forEach((d) => {
      L.poly([[x, y], [x + d * s * 0.9, y - s * 0.5], [x + d * s * 0.75, y + s * 0.05], [x + d * s * 0.55, y - s * 0.05], [x + d * s * 0.4, y + s * 0.2]], side(c, x, s, d * -1.5));
    });
    return;
  }
  if (kind === 'fairy') {
    const c = tones || [hex('#c8f0ff', 110), hex('#e0f8ff', 140), hex('#ffffff', 190)];
    [-1, 1].forEach((d) => {
      L.ball(x + d * s * 0.4, y - s * 0.2, s * 0.38, s * 0.2, c, { angle: d * -0.6 });
      L.ball(x + d * s * 0.32, y + s * 0.15, s * 0.25, s * 0.13, c, { angle: d * 0.5 });
    });
    return;
  }
  const c = tones || P.white; // feathered
  [-1, 1].forEach((d) => {
    for (let k = 0; k < 4; k++) L.ball(x + d * s * (0.25 + k * 0.14), y - s * (0.15 + k * 0.1) + k * k * s * 0.02, s * 0.3, s * 0.12, c, { angle: d * (-0.7 + k * 0.25) });
  });
}

function sword(L, x, y, s, { angle = -1.1, len = 0.7, blade = P.steel, guard = P.gold, glow } = {}) {
  const ex = x + Math.cos(angle) * s * len;
  const ey = y + Math.sin(angle) * s * len;
  if (glow) softGlow(L, (x + ex) / 2, (y + ey) / 2, s * 0.35, glow, 140);
  L.line(x, y, ex, ey, blade[2], W1(s, 12));
  L.line(x + Math.sin(angle) * s * 0.1, y - Math.cos(angle) * s * 0.1, x - Math.sin(angle) * s * 0.1, y + Math.cos(angle) * s * 0.1, guard[1], W1(s, 14));
  L.line(x, y, x - Math.cos(angle) * s * 0.12, y - Math.sin(angle) * s * 0.12, P.wood[1], W1(s, 14));
}

function staff(L, x, y, s, { orb = P.purple, glow = '#c890ff', top = -0.65 } = {}) {
  L.line(x, y + s * 0.5, x, y + s * top, P.wood[1], W1(s, 14));
  softGlow(L, x, y + s * top, s * 0.25, glow, 160);
  L.ball(x, y + s * top, s * 0.08, s * 0.08, orb);
}

function axe(L, x, y, s) {
  L.line(x, y + s * 0.3, x + s * 0.15, y - s * 0.55, P.wood[1], W1(s, 12));
  L.poly([[x + s * 0.12, y - s * 0.5], [x + s * 0.42, y - s * 0.65], [x + s * 0.38, y - s * 0.3], [x + s * 0.14, y - s * 0.35]], side(P.steel, x, s, -3));
}

function spear(L, x, y, s) {
  L.line(x, y + s * 0.5, x + s * 0.12, y - s * 0.75, P.wood[1], W1(s, 14));
  L.poly([[x + s * 0.06, y - s * 0.72], [x + s * 0.14, y - s * 0.95], [x + s * 0.2, y - s * 0.7]], P.steel[2]);
}

function torch(L, x, y, s) {
  L.line(x, y + s * 0.15, x + s * 0.05, y - s * 0.35, P.wood[1], W1(s, 12));
  softGlow(L, x + s * 0.05, y - s * 0.45, s * 0.3, '#ffb040', 170);
  flame(L, x + s * 0.05, y - s * 0.42, s * 0.18);
}

function flame(L, x, y, s, tones = P.fire) {
  L.ball(x, y, s * 0.55, s * 0.65, tones);
  L.poly([[x - s * 0.5, y], [x, y - s * 1.3], [x + s * 0.5, y]], (px, py) => toneFor(tones, (py - y) / s * -1.2, px, py));
  L.ball(x, y + s * 0.1, s * 0.25, s * 0.3, t3('#f8c040', '#fff0a0', '#ffffff'));
}

function bookIcon(L, x, y, s, cover = P.red, { open = false } = {}) {
  if (open) {
    L.poly([[x - s * 0.5, y - s * 0.25], [x, y - s * 0.18], [x, y + s * 0.25], [x - s * 0.5, y + s * 0.18]], hex('#f0e8d0'));
    L.poly([[x + s * 0.5, y - s * 0.25], [x, y - s * 0.18], [x, y + s * 0.25], [x + s * 0.5, y + s * 0.18]], hex('#d8ccb0'));
    for (let k = 0; k < 3; k++) {
      L.line(x - s * 0.42, y - s * 0.1 + k * s * 0.1, x - s * 0.08, y - s * 0.06 + k * s * 0.1, hex('#6a5a4a'));
      L.line(x + s * 0.08, y - s * 0.06 + k * s * 0.1, x + s * 0.42, y - s * 0.1 + k * s * 0.1, hex('#6a5a4a'));
    }
    return;
  }
  L.rect(Math.round(x - s * 0.3), Math.round(y - s * 0.38), Math.round(s * 0.6), Math.round(s * 0.76), cover[1]);
  L.rect(Math.round(x - s * 0.3), Math.round(y - s * 0.38), W1(s, 10), Math.round(s * 0.76), cover[0]);
  L.rect(Math.round(x + s * 0.24), Math.round(y - s * 0.34), W1(s, 14), Math.round(s * 0.7), hex('#f0e8d0'));
}

// A standing humanoid. (cx, cy): middle of the torso; s: about half its height.
function figure(L, cx, cy, s, o = {}) {
  const skin = o.skin || P.skin;
  const cloth = o.cloth || P.blue;
  const w = o.build === 'stocky' ? 1.25 : o.build === 'slim' ? 0.85 : o.build === 'small' ? 0.9 : 1;
  if (o.aura) softGlow(L, cx, cy - s * 0.1, s * 1.05, o.aura, 130);
  if (o.wings) wings(L, cx, cy - s * 0.15, s, o.wings, o.wingTones);
  if (o.cape) L.poly([[cx - s * 0.28 * w, cy - s * 0.2], [cx + s * 0.28 * w, cy - s * 0.2], [cx + s * 0.5 * w, cy + s * 0.72], [cx - s * 0.5 * w, cy + s * 0.72]], side(o.cape, cx, s));
  // legs
  if (o.robe) {
    L.poly([[cx - s * 0.26 * w, cy - s * 0.18], [cx + s * 0.26 * w, cy - s * 0.18], [cx + s * 0.46 * w, cy + s * 0.8], [cx - s * 0.46 * w, cy + s * 0.8]], side(o.robe, cx, s));
    L.line(cx - s * 0.46 * w, cy + s * 0.79, cx + s * 0.46 * w, cy + s * 0.79, (o.trim || P.gold)[1], W1(s, 14));
  } else if (o.legs === 'goat') {
    [-1, 1].forEach((d) => {
      L.poly([[cx + d * s * 0.04, cy + s * 0.3], [cx + d * s * 0.22, cy + s * 0.3], [cx + d * s * 0.26, cy + s * 0.55], [cx + d * s * 0.16, cy + s * 0.78], [cx + d * s * 0.08, cy + s * 0.78], [cx + d * s * 0.14, cy + s * 0.55]], side(P.brown, cx, s));
      L.rect(Math.round(cx + d * s * 0.12 - s * 0.05), Math.round(cy + s * 0.76), Math.round(s * 0.1), W1(s, 10), hex('#1a1210'));
    });
  } else {
    const pants = o.pants || P.dark;
    [-1, 1].forEach((d) => {
      const lx = cx + (d < 0 ? -0.18 : 0.04) * s * w;
      L.rect(Math.round(lx), Math.round(cy + s * 0.32), Math.round(s * 0.14 * w), Math.round(s * 0.4), pants[1]);
      L.rect(Math.round(lx - s * 0.02), Math.round(cy + s * 0.68), Math.round(s * 0.18 * w), Math.round(s * 0.1), hex('#1a1210'));
    });
  }
  // torso
  L.poly([[cx - s * 0.3 * w, cy - s * 0.2], [cx + s * 0.3 * w, cy - s * 0.2], [cx + s * 0.26 * w, cy + s * 0.38], [cx - s * 0.26 * w, cy + s * 0.38]], side(o.armor ? P.steel : cloth, cx, s));
  if (!o.robe) L.rect(Math.round(cx - s * 0.27 * w), Math.round(cy + s * 0.26), Math.round(s * 0.54 * w), W1(s, 14), hex('#2a1a10'));
  if (o.armor) L.ball(cx, cy, s * 0.16 * w, s * 0.14, o.emblem || P.gold);
  if (o.ribs) for (let k = 0; k < 3; k++) L.line(cx - s * 0.18, cy - s * 0.08 + k * s * 0.1, cx + s * 0.18, cy - s * 0.08 + k * s * 0.1, hex('#1a1210'));
  // arms
  const arm = o.armor ? P.steel[1] : o.sleeve || cloth[1];
  const lh = [cx - s * 0.44 * w, cy + (o.leftUp ? -s * 0.12 : s * 0.24)];
  const rh = [cx + s * 0.44 * w, cy + s * 0.04];
  L.line(cx - s * 0.28 * w, cy - s * 0.15, lh[0], lh[1], arm, W1(s, 8));
  L.line(cx + s * 0.28 * w, cy - s * 0.15, rh[0], rh[1], arm, W1(s, 8));
  const item = o.item;
  if (item === 'sword') sword(L, rh[0], rh[1], s, { glow: o.itemGlow, blade: o.blade || P.steel });
  if (item === 'staff') staff(L, rh[0], rh[1], s, { orb: o.orb || P.purple, glow: o.itemGlow || '#c890ff' });
  if (item === 'axe') axe(L, rh[0], rh[1], s);
  if (item === 'spear') spear(L, rh[0], rh[1], s);
  if (item === 'torch') torch(L, rh[0], rh[1], s);
  if (item === 'dagger') sword(L, rh[0], rh[1], s, { len: 0.32, angle: -0.6 });
  if (item === 'woodSword') sword(L, rh[0], rh[1], s, { blade: P.wood, guard: P.brown });
  if (item === 'bow') { L.line(rh[0], rh[1] - s * 0.4, rh[0], rh[1] + s * 0.4, P.wood[1], W1(s, 14)); for (let a = -1.2; a <= 1.2; a += 0.03) L.set(rh[0] + Math.cos(a) * s * 0.2, rh[1] + Math.sin(a) * s * 0.4, P.wood[2]); }
  if (item === 'book') bookIcon(L, rh[0], rh[1], s * 0.35, o.cover || P.red);
  if (item === 'lantern') { L.line(rh[0], rh[1], rh[0], rh[1] + s * 0.12, hex('#2a2020')); softGlow(L, rh[0], rh[1] + s * 0.22, s * 0.25, '#ffe080', 170); L.ball(rh[0], rh[1] + s * 0.22, s * 0.08, s * 0.1, P.gold); }
  if (o.shield) {
    L.ball(lh[0], lh[1], s * 0.2, s * 0.25, o.shield);
    L.ball(lh[0], lh[1], s * 0.08, s * 0.1, o.shieldBoss || P.gold);
  }
  if (o.offhand === 'book') bookIcon(L, lh[0], lh[1], s * 0.35, o.cover2 || P.blue);
  if (o.offhand === 'orb') { softGlow(L, lh[0], lh[1] - s * 0.05, s * 0.25, o.orbGlow || '#80e0ff', 160); L.ball(lh[0], lh[1] - s * 0.05, s * 0.09, s * 0.09, o.orb2 || P.ice); }
  if (o.offhand === 'flame') { softGlow(L, lh[0], lh[1] - s * 0.1, s * 0.3, '#ffa040', 170); flame(L, lh[0], lh[1] - s * 0.05, s * 0.14); }
  [lh, rh].forEach(([x, y]) => L.ball(x, y, s * 0.06, s * 0.06, o.armor ? P.steel : skin));
  head(L, cx, cy - s * 0.42, s, o);
}

function head(L, x, y, s, o) {
  const kind = o.head || 'human';
  const skin = o.skin || P.skin;
  const eye = hex(o.eye || '#1a1210');
  if (kind === 'goblin') {
    [-1, 1].forEach((d) => L.poly([[x + d * s * 0.12, y - s * 0.05], [x + d * s * 0.45, y - s * 0.2], [x + d * s * 0.15, y + s * 0.08]], side(skin, x, s, d * -2)));
    L.ball(x, y, s * 0.19, s * 0.17, skin);
    L.ball(x - s * 0.02, y + s * 0.04, s * 0.05, s * 0.06, skin);
    [-0.08, 0.06].forEach((dx) => L.set(x + dx * s, y - s * 0.03, hex(o.eye || '#f8e040')));
    L.line(x - s * 0.07, y + s * 0.1, x + s * 0.06, y + s * 0.1, hex('#1a1210'));
  } else if (kind === 'orc') {
    L.ball(x, y, s * 0.21, s * 0.19, skin);
    L.line(x - s * 0.14, y - s * 0.06, x + s * 0.14, y - s * 0.06, skin[0], W1(s, 14));
    [-0.08, 0.08].forEach((dx) => L.set(x + dx * s, y - s * 0.02, hex(o.eye || '#f04020')));
    [-0.08, 0.08].forEach((dx) => L.line(x + dx * s, y + s * 0.1, x + dx * s, y + s * 0.03, hex('#fffae0'), W1(s, 18)));
  } else if (kind === 'wolf') {
    [-1, 1].forEach((d) => L.poly([[x + d * s * 0.06, y - s * 0.12], [x + d * s * 0.2, y - s * 0.36], [x + d * s * 0.22, y - s * 0.08]], side(skin, x, s)));
    L.ball(x, y, s * 0.2, s * 0.18, skin);
    L.ball(x - s * 0.16, y + s * 0.06, s * 0.14, s * 0.08, skin);
    L.set(x - s * 0.29, y + s * 0.03, hex('#1a1210'));
    [-0.08, 0.06].forEach((dx) => L.set(x + dx * s, y - s * 0.05, hex(o.eye || '#f8d040')));
    L.line(x - s * 0.26, y + s * 0.12, x - s * 0.08, y + s * 0.12, hex('#fffae0'));
  } else if (kind === 'skull') {
    L.ball(x, y, s * 0.18, s * 0.19, P.bone);
    [-0.07, 0.07].forEach((dx) => { L.ball(x + dx * s, y - s * 0.02, s * 0.05, s * 0.05, t3('#0a0a0a', '#1a1010', '#2a1a1a')); L.set(x + dx * s, y - s * 0.02, hex(o.eye || '#ff3a2a')); });
    L.line(x - s * 0.08, y + s * 0.12, x + s * 0.08, y + s * 0.12, hex('#3a3030'));
  } else if (kind === 'helm') {
    L.ball(x, y, s * 0.2, s * 0.22, P.steel);
    L.rect(Math.round(x - s * 0.14), Math.round(y - s * 0.03), Math.round(s * 0.28), W1(s, 12), hex('#0a0a10'));
    [-0.07, 0.07].forEach((dx) => L.set(x + dx * s, y - s * 0.01, hex(o.eye || '#80f0ff')));
    L.line(x, y - s * 0.22, x, y - s * 0.05, P.steel[0]);
  } else {
    if (o.hair && o.hairStyle === 'long') L.rect(Math.round(x - s * 0.2), Math.round(y - s * 0.05), Math.round(s * 0.4), Math.round(s * 0.42), o.hair[1]);
    L.ball(x, y, s * 0.16, s * 0.19, skin);
    [-0.06, 0.06].forEach((dx) => L.set(x + dx * s, y - s * 0.02, eye));
    if (o.glasses) [-0.06, 0.06].forEach((dx) => L.ball(x + dx * s, y - s * 0.02, s * 0.045, s * 0.045, [hex('#c8e8ff', 120), hex('#c8e8ff', 120), hex('#ffffff', 160)]));
    if (o.beard) L.ball(x, y + s * 0.13, s * 0.15, s * 0.12, o.beard);
    if (o.hair) L.ball(x, y - s * 0.12, s * 0.18, s * 0.1, o.hair);
    if (o.flameHair) { flame(L, x, y - s * 0.22, s * 0.16); flame(L, x - s * 0.1, y - s * 0.15, s * 0.1); flame(L, x + s * 0.1, y - s * 0.15, s * 0.1); }
  }
  hat(L, x, y, s, o.hat, o);
}

function hat(L, x, y, s, kind, o) {
  if (!kind) return;
  if (kind === 'hood') {
    const c = o.hood || P.dark;
    L.poly([[x - s * 0.24, y + s * 0.15], [x - s * 0.22, y - s * 0.15], [x, y - s * 0.3], [x + s * 0.22, y - s * 0.15], [x + s * 0.24, y + s * 0.15], [x + s * 0.17, y - s * 0.05], [x, y - s * 0.17], [x - s * 0.17, y - s * 0.05]], side(c, x, s));
  } else if (kind === 'wizard') {
    const c = o.hatTones || P.purple;
    L.poly([[x - s * 0.3, y - s * 0.12], [x + s * 0.3, y - s * 0.12], [x + s * 0.18, y - s * 0.2], [x + s * 0.12, y - s * 0.65], [x - s * 0.18, y - s * 0.2]], side(c, x, s));
    L.line(x - s * 0.3, y - s * 0.12, x + s * 0.3, y - s * 0.12, c[0], W1(s, 14));
    star(L, x, y - s * 0.35, '#fff080');
  } else if (kind === 'crown' || kind === 'tiara') {
    const big = kind === 'crown' ? 1 : 0.6;
    const yy = y - s * 0.17;
    const pts = [[x - s * 0.17, yy], [x - s * 0.17, yy - s * 0.14 * big], [x - s * 0.08, yy - s * 0.05], [x, yy - s * 0.18 * big], [x + s * 0.08, yy - s * 0.05], [x + s * 0.17, yy - s * 0.14 * big], [x + s * 0.17, yy]];
    L.poly(pts, (px, py) => toneFor(P.gold, -((px - x) / s) * 2 - ((py - yy) / s) * 4, px, py));
    L.set(x, yy - s * 0.08 * big, hex(o.gem || '#e8203a'));
  } else if (kind === 'helmet') {
    L.ball(x, y - s * 0.08, s * 0.19, s * 0.15, P.steel);
    L.line(x, y - s * 0.08, x, y + s * 0.06, P.steel[0], W1(s, 14));
  } else if (kind === 'cap') {
    L.ball(x, y - s * 0.12, s * 0.18, s * 0.1, o.capTones || P.red);
    L.poly([[x - s * 0.1, y - s * 0.18], [x + s * 0.25, y - s * 0.32], [x + s * 0.12, y - s * 0.12]], (o.capTones || P.red)[1]);
  } else if (kind === 'horns' || kind === 'goatHorns') {
    const c = kind === 'horns' ? t3('#3a2a20', '#8a7060', '#d8c8b0') : P.brown;
    [-1, 1].forEach((d) => { for (let k = 0; k < 6; k++) L.ball(x + d * s * (0.12 + k * 0.04), y - s * (0.16 + k * 0.04) + k * k * s * 0.008, s * (0.06 - k * 0.006), s * (0.06 - k * 0.006), c); });
  } else if (kind === 'antlers') {
    [-1, 1].forEach((d) => {
      L.line(x + d * s * 0.1, y - s * 0.15, x + d * s * 0.32, y - s * 0.45, P.bark[2], W1(s, 16));
      L.line(x + d * s * 0.22, y - s * 0.3, x + d * s * 0.12, y - s * 0.45, P.bark[2], W1(s, 18));
      L.line(x + d * s * 0.3, y - s * 0.42, x + d * s * 0.42, y - s * 0.5, P.bark[2], W1(s, 18));
    });
  } else if (kind === 'leaves') {
    for (let k = -2; k <= 2; k++) L.ball(x + k * s * 0.08, y - s * 0.18 - Math.abs(k === 0 ? 0.04 : 0) * s, s * 0.06, s * 0.04, P.leaf, { angle: k * 0.4 });
  }
}

// ---------- creatures ----------
// A dragon facing left. o: tones, belly, wing, horns, crown|tiara, baby.
function dragon(L, cx, cy, s, o = {}) {
  const c = o.tones || P.blue;
  const belly = o.belly || t3('#c8b080', '#f0e0b0', '#fff8e0');
  const wingT = o.wing || c;
  const baby = !!o.baby;
  if (o.aura) softGlow(L, cx, cy - s * 0.1, s * 1.1, o.aura, 130);
  // wings
  const ws = baby ? 0.5 : 1;
  const wx = cx + s * 0.1;
  const wy = cy - s * 0.15;
  L.poly([[wx, wy], [wx - s * 0.05 * ws, wy - s * 0.8 * ws], [wx + s * 0.55 * ws, wy - s * 0.65 * ws], [wx + s * 0.75 * ws, wy - s * 0.2 * ws], [wx + s * 0.4 * ws, wy + s * 0.05]], side(wingT, wx, s, -2));
  L.line(wx, wy, wx - s * 0.05 * ws, wy - s * 0.8 * ws, c[0], W1(s, 18));
  L.line(wx - s * 0.05 * ws, wy - s * 0.8 * ws, wx + s * 0.55 * ws, wy - s * 0.65 * ws, c[0], W1(s, 20));
  // tail
  for (let t = 0; t <= 1; t += 0.04) L.ball(cx + s * (0.4 + t * 0.6), cy + s * (0.25 - Math.sin(t * 3) * 0.15 * (1 - t)), s * 0.14 * (1 - t * 0.8), s * 0.12 * (1 - t * 0.8), c);
  // legs
  [[-0.15, 0.32], [0.3, 0.34]].forEach(([dx, dy]) => { L.ball(cx + dx * s, cy + dy * s, s * 0.1, s * 0.16, c); L.rect(Math.round(cx + dx * s - s * 0.09), Math.round(cy + (dy + 0.13) * s), Math.round(s * 0.14), W1(s, 14), c[0]); });
  // body
  L.ball(cx + s * 0.08, cy + s * 0.12, s * (baby ? 0.32 : 0.42), s * (baby ? 0.26 : 0.3), c);
  L.ball(cx - s * 0.02, cy + s * 0.2, s * (baby ? 0.2 : 0.28), s * 0.16, belly);
  // neck and head
  const hx = cx - s * (baby ? 0.32 : 0.45);
  const hy = cy - s * (baby ? 0.22 : 0.42);
  if (!baby) for (let t = 0; t <= 1; t += 0.05) L.ball(cx - s * 0.1 + (hx - cx + s * 0.1) * t, cy + (hy - cy) * t, s * 0.13, s * 0.13, c);
  const hr = baby ? 0.27 : 0.2;
  L.ball(hx, hy, s * hr, s * hr * 0.8, c);
  L.ball(hx - s * hr * 0.9, hy + s * hr * 0.25, s * hr * 0.6, s * hr * 0.45, c);
  L.set(hx - s * hr * 1.35, hy + s * hr * 0.1, hex('#1a1210'));
  L.ball(hx - s * hr * 0.15, hy - s * hr * 0.15, s * hr * 0.22, s * hr * 0.22, t3('#ffffff', '#ffffff', '#ffffff'));
  L.set(hx - s * hr * 0.22, hy - s * hr * 0.12, hex(o.eye || '#1a1210'));
  // horns
  const horn = o.horns || t3('#8a7a5a', '#d8c8a0', '#fff8e0');
  [0, 1].forEach((k) => L.poly([[hx + s * hr * (0.2 + k * 0.4), hy - s * hr * 0.6], [hx + s * hr * (0.9 + k * 0.4), hy - s * hr * (1.4 + k * 0.1)], [hx + s * hr * (0.6 + k * 0.4), hy - s * hr * 0.4]], horn[1]));
  if (o.crown || o.tiara) hat(L, hx + s * hr * 0.1, hy + s * hr * 0.15, s * (o.crown ? 1.3 : 1), o.crown ? 'crown' : 'tiara', { gem: o.gem || '#3ac0ff' });
  if (o.breath) { softGlow(L, hx - s * hr * 2.2, hy + s * hr * 0.4, s * 0.35, o.breath, 170); flame(L, hx - s * hr * 2.1, hy + s * hr * 0.6, s * 0.12, o.breathTones || P.fire); }
}

function fish(L, cx, cy, s, o = {}) {
  const kind = o.kind || 'fish';
  const c = o.tones || P.blue;
  if (kind === 'manta') {
    L.poly([[cx - s * 0.9, cy], [cx, cy - s * 0.4], [cx + s * 0.9, cy], [cx + s * 0.2, cy + s * 0.25], [cx - s * 0.2, cy + s * 0.25]], side(c, cx, s, 1.5));
    L.line(cx, cy + s * 0.2, cx + s * 0.25, cy + s * 0.9, c[0], W1(s, 18));
    [-0.12, 0.12].forEach((dx) => L.set(cx + dx * s, cy - s * 0.15, hex('#f0f8ff')));
    L.ball(cx, cy - s * 0.05, s * 0.2, s * 0.12, [c[1], c[2], hex('#ffffff')]);
    return;
  }
  if (kind === 'eel') {
    for (let t = 0; t <= 1; t += 0.02) L.ball(cx - s * 0.8 + t * s * 1.6, cy + Math.sin(t * 9) * s * 0.18, s * 0.11 * (1 - t * 0.5), s * 0.11 * (1 - t * 0.5), c);
    L.set(cx - s * 0.84, cy - s * 0.03, hex('#f8e040'));
    return;
  }
  const len = kind === 'shark' ? 0.85 : kind === 'small' ? 0.45 : 0.6;
  const hgt = kind === 'shark' ? 0.28 : kind === 'small' ? 0.36 : 0.32;
  // tail
  L.poly([[cx + s * len * 0.8, cy], [cx + s * (len + 0.35), cy - s * 0.35], [cx + s * (len + 0.25), cy], [cx + s * (len + 0.35), cy + s * 0.35]], side(o.fin || c, cx, s));
  // fins
  L.poly([[cx - s * 0.1, cy - s * hgt * 0.8], [cx + s * 0.15, cy - s * (hgt + (kind === 'shark' ? 0.4 : 0.22))], [cx + s * 0.3, cy - s * hgt * 0.7]], (o.fin || c)[1]);
  L.ball(cx, cy, s * len, s * hgt, c);
  if (kind === 'shark') {
    L.ball(cx - s * 0.15, cy + s * 0.12, s * 0.55, s * 0.12, P.white);
    L.poly([[cx - s * 0.8, cy + s * 0.02], [cx - s * 0.45, cy + s * 0.03], [cx - s * 0.5, cy + s * 0.14]], hex('#3a0a0a'));
    for (let k = 0; k < 4; k++) L.set(cx - s * (0.75 - k * 0.08), cy + s * 0.04, hex('#ffffff'));
  }
  if (o.spots) {
    const r = rng(o.seed || 1);
    for (let i = 0; i < 6; i++) L.ball(cx + (r() - 0.5) * s * len * 1.4, cy + (r() - 0.5) * s * hgt, s * 0.1, s * 0.07, o.spots);
  }
  if (o.whiskers) { L.line(cx - s * len, cy + s * 0.05, cx - s * (len + 0.25), cy + s * 0.2, hex('#f8d090')); L.line(cx - s * len, cy + s * 0.08, cx - s * (len + 0.15), cy + s * 0.3, hex('#f8d090')); }
  L.ball(cx - s * len * 0.6, cy - s * hgt * 0.25, s * 0.07, s * 0.07, t3('#ffffff', '#ffffff', '#ffffff'));
  L.set(cx - s * len * 0.64, cy - s * hgt * 0.25, hex('#1a1210'));
  L.line(cx - s * len * 0.35, cy - s * hgt * 0.7, cx - s * len * 0.25, cy + s * hgt * 0.7, c[0]);
}

function serpent(L, cx, cy, s, o = {}) {
  const c = o.tones || P.green;
  if (o.wings) wings(L, cx + s * 0.1, cy - s * 0.25, s * 0.8, 'bat', o.wingTones || P.moss);
  for (let t = 1; t >= 0; t -= 0.015) {
    const a = t * Math.PI * 2.4;
    const r = s * (0.15 + t * 0.4);
    L.ball(cx + Math.cos(a) * r, cy + s * 0.35 + Math.sin(a) * r * 0.45, s * (0.1 + t * 0.05), s * (0.1 + t * 0.05), c);
  }
  // neck up to the head
  for (let t = 0; t <= 1; t += 0.05) L.ball(cx - s * 0.1 * t, cy + s * 0.2 - t * s * 0.6, s * 0.1, s * 0.1, c);
  const hx = cx - s * 0.18;
  const hy = cy - s * 0.45;
  L.ball(hx, hy, s * 0.17, s * 0.12, c);
  L.set(hx - s * 0.04, hy - s * 0.04, hex(o.eye || '#f8e040'));
  L.line(hx - s * 0.17, hy + s * 0.05, hx - s * 0.3, hy + s * 0.1, hex('#d8203a'));
  if (o.crest) for (let k = 0; k < 3; k++) L.line(hx + s * (0.05 + k * 0.05), hy - s * 0.1, hx + s * (0.12 + k * 0.06), hy - s * 0.25, o.crest);
}

function hydra(L, cx, cy, s, o = {}) {
  const c = o.tones || P.teal;
  L.ball(cx + s * 0.1, cy + s * 0.35, s * 0.5, s * 0.3, c);
  const heads = o.heads || 5;
  for (let i = 0; i < heads; i++) {
    const f = heads === 1 ? 0.5 : i / (heads - 1);
    const ex = cx - s * 0.6 + f * s * 1.1;
    const ey = cy - s * (0.45 + Math.sin(f * Math.PI) * 0.3);
    for (let t = 0; t <= 1; t += 0.05) L.ball(cx + s * 0.1 + (ex - cx - s * 0.1) * t, cy + s * 0.3 + (ey - cy - s * 0.3) * t - Math.sin(t * Math.PI) * s * 0.12, s * 0.08, s * 0.08, c);
    L.ball(ex, ey, s * 0.13, s * 0.09, c);
    L.ball(ex - s * 0.11, ey + s * 0.03, s * 0.07, s * 0.05, c);
    L.set(ex - s * 0.03, ey - s * 0.03, hex(o.eye || '#f8e040'));
  }
}

function owl(L, cx, cy, s, o = {}) {
  const c = o.tones || P.brown;
  L.line(cx - s * 0.8, cy + s * 0.55, cx + s * 0.8, cy + s * 0.5, P.bark[1], W1(s, 8));
  if (o.spread) wings(L, cx, cy - s * 0.05, s * 0.9, 'feather', c);
  L.ball(cx, cy + s * 0.1, s * 0.36, s * 0.45, c);
  L.ball(cx, cy + s * 0.22, s * 0.22, s * 0.3, t3('#a88a6a', '#d8c0a0', '#f0e0c8'));
  L.ball(cx, cy - s * 0.32, s * 0.3, s * 0.25, c);
  [-1, 1].forEach((d) => {
    L.poly([[cx + d * s * 0.12, cy - s * 0.48], [cx + d * s * 0.28, cy - s * 0.72], [cx + d * s * 0.3, cy - s * 0.45]], c[0]);
    L.ball(cx + d * s * 0.13, cy - s * 0.32, s * 0.11, s * 0.11, t3('#c89a2a', o.eyes || '#f8d040', '#fff8a0'));
    L.ball(cx + d * s * 0.13, cy - s * 0.32, s * 0.04, s * 0.04, t3('#0a0a0a', '#0a0a0a', '#1a1a1a'));
  });
  L.poly([[cx - s * 0.04, cy - s * 0.24], [cx + s * 0.04, cy - s * 0.24], [cx, cy - s * 0.14]], hex('#e8a020'));
  [-0.12, 0.12].forEach((dx) => L.line(cx + dx * s, cy + s * 0.5, cx + dx * s, cy + s * 0.58, hex('#e8a020'), W1(s, 14)));
}

function spider(L, cx, cy, s, o = {}) {
  const c = o.tones || P.dark;
  [-1, 1].forEach((d) => {
    for (let k = 0; k < 4; k++) {
      const kx = cx + d * s * (0.3 + k * 0.05);
      const ky = cy - s * (0.35 - k * 0.12);
      L.line(cx + d * s * 0.1, cy + (k - 1.5) * s * 0.06, kx, ky, c[1], W1(s, 16));
      L.line(kx, ky, kx + d * s * 0.25, cy + s * (0.35 + k * 0.05), c[1], W1(s, 16));
    }
  });
  L.ball(cx + s * 0.05, cy + s * 0.05, s * 0.32, s * 0.27, c);
  L.ball(cx - s * 0.28, cy - s * 0.03, s * 0.17, s * 0.15, c);
  if (o.mark) L.ball(cx + s * 0.08, cy + s * 0.02, s * 0.1, s * 0.12, o.mark);
  for (let k = 0; k < 4; k++) L.set(cx - s * (0.36 - (k % 2) * 0.05), cy - s * (0.08 + Math.floor(k / 2) * 0.05), hex(o.eye || '#ff3a3a'));
}

function roach(L, cx, cy, s) {
  const c = t3('#2a140a', '#6a3418', '#a8602a');
  for (let k = 0; k < 3; k++) [-1, 1].forEach((d) => L.line(cx + (k - 1) * s * 0.25, cy + s * 0.1, cx + (k - 1) * s * 0.32 + d * s * 0.05, cy + s * 0.42, c[0], W1(s, 16)));
  L.ball(cx + s * 0.08, cy, s * 0.5, s * 0.28, c);
  L.line(cx + s * 0.08, cy - s * 0.25, cx + s * 0.08, cy + s * 0.25, c[0]);
  L.ball(cx - s * 0.45, cy - s * 0.02, s * 0.16, s * 0.14, c);
  L.line(cx - s * 0.55, cy - s * 0.12, cx - s * 0.9, cy - s * 0.55, c[0]);
  L.line(cx - s * 0.5, cy - s * 0.14, cx - s * 0.65, cy - s * 0.65, c[0]);
  L.ball(cx - s * 0.45, cy - s * 0.12, s * 0.15, s * 0.08, P.steel); // helmet
  L.set(cx - s * 0.52, cy - s * 0.02, hex('#f8e040'));
  sword(L, cx - s * 0.35, cy + s * 0.15, s, { angle: -2.5, len: 0.45 });
}

function tarasca(L, cx, cy, s) {
  const shell = t3('#3a2a14', '#6a5a2a', '#a8904a');
  const skin = t3('#2a4a2a', '#4a7a3a', '#8aba5a');
  [[-0.45, 0.4], [-0.1, 0.48], [0.35, 0.48], [0.62, 0.38]].forEach(([dx, dy]) => L.ball(cx + dx * s, cy + dy * s, s * 0.12, s * 0.16, skin));
  for (let t = 0; t <= 1; t += 0.05) L.ball(cx + s * (0.65 + t * 0.35), cy + s * (0.25 + t * 0.1), s * 0.1 * (1 - t * 0.7), s * 0.09 * (1 - t * 0.7), skin);
  L.ball(cx + s * 0.1, cy + s * 0.1, s * 0.62, s * 0.4, shell);
  for (let k = 0; k < 6; k++) {
    const x = cx + s * (-0.35 + k * 0.17);
    const y = cy - s * (0.18 + Math.sin((k / 5) * Math.PI) * 0.12);
    L.poly([[x - s * 0.06, y + s * 0.05], [x, y - s * 0.16], [x + s * 0.06, y + s * 0.05]], (px, py) => toneFor(t3('#8a8070', '#d8d0b8', '#fffaf0'), -((px - x) / s) * 8, px, py));
  }
  for (let t = 0; t <= 1; t += 0.06) L.ball(cx - s * (0.45 + t * 0.2), cy + s * (0.05 - t * 0.25), s * 0.12, s * 0.12, skin);
  const hx = cx - s * 0.72;
  const hy = cy - s * 0.25;
  L.ball(hx, hy, s * 0.18, s * 0.14, skin);
  L.ball(hx - s * 0.15, hy + s * 0.04, s * 0.11, s * 0.08, skin);
  L.set(hx - s * 0.02, hy - s * 0.05, hex('#f8e040'));
  [0, 1].forEach((k) => L.poly([[hx + s * (0.04 + k * 0.08), hy - s * 0.1], [hx + s * (0.14 + k * 0.1), hy - s * 0.3], [hx + s * (0.12 + k * 0.08), hy - s * 0.08]], hex('#d8c8a0')));
}

function blob(L, cx, cy, s, tones, { face = true, eyes = '#1a1210' } = {}) {
  L.ball(cx, cy, s * 0.4, s * 0.36, tones);
  if (!face) return;
  [-0.12, 0.12].forEach((dx) => { L.ball(cx + dx * s, cy - s * 0.04, s * 0.07, s * 0.09, t3('#ffffff', '#ffffff', '#ffffff')); L.set(cx + dx * s - 1, cy - s * 0.02, hex(eyes)); });
  L.line(cx - s * 0.06, cy + s * 0.12, cx + s * 0.06, cy + s * 0.12, hex(eyes));
}

// ---------- objects ----------
function building(L, cx, cy, s, o = {}) {
  const c = o.tones || P.grey;
  const kind = o.kind || 'citadel';
  if (kind === 'cathedral') {
    L.rect(Math.round(cx - s * 0.5), Math.round(cy - s * 0.2), Math.round(s), Math.round(s * 0.75), c[1]);
    L.poly([[cx - s * 0.55, cy - s * 0.2], [cx, cy - s * 0.55], [cx + s * 0.55, cy - s * 0.2]], c[0]);
    [-0.4, 0.4].forEach((dx) => { L.rect(Math.round(cx + dx * s - s * 0.1), Math.round(cy - s * 0.5), Math.round(s * 0.2), Math.round(s * 1.05), c[1]); L.poly([[cx + dx * s - s * 0.13, cy - s * 0.5], [cx + dx * s, cy - s * 0.9], [cx + dx * s + s * 0.13, cy - s * 0.5]], c[0]); });
    L.ball(cx, cy - s * 0.02, s * 0.14, s * 0.14, o.glass || t3('#2a6a2a', '#5ab83a', '#c8f080'));
    L.rect(Math.round(cx - s * 0.1), Math.round(cy + s * 0.25), Math.round(s * 0.2), Math.round(s * 0.3), hex('#2a1a10'));
    return;
  }
  if (kind === 'tower') {
    L.rect(Math.round(cx - s * 0.18), Math.round(cy - s * 0.6), Math.round(s * 0.36), Math.round(s * 1.2), c[1]);
    L.poly([[cx - s * 0.26, cy - s * 0.6], [cx, cy - s * 0.95], [cx + s * 0.26, cy - s * 0.6]], c[0]);
    softGlow(L, cx, cy - s * 0.35, s * 0.2, '#ffe080', 170);
    L.rect(Math.round(cx - s * 0.05), Math.round(cy - s * 0.42), Math.round(s * 0.1), Math.round(s * 0.12), hex('#ffe080'));
    return;
  }
  // citadel: walls, gate and towers with banners
  L.rect(Math.round(cx - s * 0.8), Math.round(cy - s * 0.1), Math.round(s * 1.6), Math.round(s * 0.6), c[1]);
  for (let k = 0; k < 8; k++) L.rect(Math.round(cx - s * 0.8 + k * s * 0.21), Math.round(cy - s * 0.18), Math.round(s * 0.1), Math.round(s * 0.09), c[1]);
  [-0.65, 0, 0.65].forEach((dx, i) => {
    const th = i === 1 ? 0.75 : 0.5;
    L.rect(Math.round(cx + dx * s - s * 0.14), Math.round(cy - s * th), Math.round(s * 0.28), Math.round(s * (th + 0.5)), c[i === 1 ? 2 : 1]);
    L.line(cx + dx * s, cy - s * th, cx + dx * s, cy - s * (th + 0.3), hex('#2a1a10'));
    L.poly([[cx + dx * s, cy - s * (th + 0.3)], [cx + dx * s + s * 0.2, cy - s * (th + 0.25)], [cx + dx * s, cy - s * (th + 0.18)]], (o.banner || P.green)[1]);
  });
  L.ball(cx, cy + s * 0.32, s * 0.14, s * 0.2, t3('#1a1010', '#2a1a10', '#3a2418'));
}

function chalice(L, cx, cy, s, liquid = P.blood) {
  L.poly([[cx - s * 0.35, cy - s * 0.35], [cx + s * 0.35, cy - s * 0.35], [cx + s * 0.2, cy + s * 0.05], [cx - s * 0.2, cy + s * 0.05]], side(P.gold, cx, s, 2));
  L.ball(cx, cy - s * 0.35, s * 0.35, s * 0.08, liquid);
  L.rect(Math.round(cx - s * 0.05), Math.round(cy + s * 0.05), Math.round(s * 0.1), Math.round(s * 0.3), P.gold[1]);
  L.ball(cx, cy + s * 0.4, s * 0.25, s * 0.08, P.gold);
  L.ball(cx, cy - s * 0.12, s * 0.06, s * 0.06, t3('#5a0a2a', '#d8203a', '#ff8aa0'));
  for (let k = 0; k < 3; k++) L.line(cx + s * (0.2 - k * 0.12), cy - s * 0.3, cx + s * (0.22 - k * 0.12), cy - s * (0.1 - k * 0.05), liquid[1], W1(s, 18));
}

function scroll(L, cx, cy, s, { ink = '#5a3a1a', map = false } = {}) {
  L.rect(Math.round(cx - s * 0.5), Math.round(cy - s * 0.35), Math.round(s), Math.round(s * 0.7), hex('#e8d8a8'));
  [-1, 1].forEach((d) => L.ball(cx + d * s * 0.52, cy, s * 0.07, s * 0.38, t3('#8a6a3a', '#c8a060', '#f0d8a0')));
  if (map) {
    const r = rng(4);
    let x = cx - s * 0.4; let y = cy + s * 0.2;
    for (let k = 0; k < 8; k++) { const nx = x + s * 0.1; const ny = cy + (r() - 0.5) * s * 0.4; for (let t = 0; t < 1; t += 0.34) L.set(x + (nx - x) * t, y + (ny - y) * t, hex(ink)); x = nx; y = ny; }
    L.line(x - s * 0.06, y - s * 0.06, x + s * 0.06, y + s * 0.06, hex('#c81a1a'), W1(s, 14));
    L.line(x - s * 0.06, y + s * 0.06, x + s * 0.06, y - s * 0.06, hex('#c81a1a'), W1(s, 14));
  } else {
    for (let k = 0; k < 4; k++) L.line(cx - s * 0.38, cy - s * 0.22 + k * s * 0.13, cx + s * (0.3 - (k % 2) * 0.15), cy - s * 0.22 + k * s * 0.13, hex(ink));
  }
}

function gear(L, cx, cy, s, tones = P.gold, teeth = 10) {
  for (let k = 0; k < teeth; k++) {
    const a = (k / teeth) * Math.PI * 2;
    L.ball(cx + Math.cos(a) * s * 0.42, cy + Math.sin(a) * s * 0.42, s * 0.09, s * 0.09, tones);
  }
  L.ball(cx, cy, s * 0.42, s * 0.42, tones);
  L.ball(cx, cy, s * 0.14, s * 0.14, t3('#2a1a10', '#3a2418', '#4a3020'));
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.4;
    L.ball(cx + Math.cos(a) * s * 0.27, cy + Math.sin(a) * s * 0.27, s * 0.06, s * 0.06, t3('#2a1a10', '#3a2418', '#4a3020'));
  }
}

function potion(L, cx, cy, s, liquid = P.green, glowColor = '#8aff8a') {
  softGlow(L, cx, cy + s * 0.1, s * 0.6, glowColor, 140);
  L.ball(cx, cy + s * 0.15, s * 0.32, s * 0.32, [hex('#c8f0ff', 120), hex('#e0f8ff', 140), hex('#ffffff', 190)]);
  L.ball(cx, cy + s * 0.22, s * 0.28, s * 0.22, liquid);
  L.rect(Math.round(cx - s * 0.08), Math.round(cy - s * 0.35), Math.round(s * 0.16), Math.round(s * 0.25), hex('#c8f0ff', 170));
  L.rect(Math.round(cx - s * 0.1), Math.round(cy - s * 0.42), Math.round(s * 0.2), Math.round(s * 0.08), P.wood[1]);
  L.set(cx - s * 0.12, cy + s * 0.05, hex('#ffffff'));
}

function horn(L, cx, cy, s, tones = P.gold) {
  for (let t = 0; t <= 1; t += 0.03) L.ball(cx - s * 0.5 + t * s, cy + Math.sin(t * Math.PI) * -s * 0.2, s * (0.06 + t * 0.2), s * (0.06 + t * 0.2), tones);
  L.ball(cx + s * 0.52, cy, s * 0.08, s * 0.26, t3('#2a1a10', '#3a2418', '#4a3020'));
  for (let k = 0; k < 3; k++) L.line(cx + s * (0.65 + k * 0.08), cy - s * (0.3 - k * 0.04), cx + s * (0.65 + k * 0.08), cy + s * (0.3 - k * 0.04), hex('#fff8c0', 150));
}

function moonCrescent(L, cx, cy, s, tones = t3('#a8b0c8', '#e0e8f8', '#ffffff'), cut = '#060818') {
  L.ball(cx, cy, s * 0.4, s * 0.4, tones);
  L.ball(cx + s * 0.16, cy - s * 0.08, s * 0.36, s * 0.36, [hex(cut), hex(cut), hex(cut)]);
}

function vortex(L, cx, cy, s, tones = P.purple) {
  softGlow(L, cx, cy, s * 0.9, '#8a4ad8', 150);
  for (let t = 0; t < Math.PI * 6; t += 0.03) {
    const r = s * (0.05 + t / (Math.PI * 6) * 0.75);
    L.ball(cx + Math.cos(t) * r, cy + Math.sin(t) * r * 0.6, s * 0.04, s * 0.04, tones);
  }
  L.ball(cx, cy, s * 0.16, s * 0.1, t3('#000000', '#000000', '#0a0410'));
}

function bonfire(L, cx, cy, s) {
  softGlow(L, cx, cy - s * 0.2, s * 0.9, '#ffa040', 170);
  [[-0.4, 0.3, 0.4, 0.1], [0.4, 0.3, -0.4, 0.1], [-0.3, 0.4, 0.35, 0.35]].forEach(([a, b, c, d]) => L.line(cx + a * s, cy + b * s, cx + c * s, cy + d * s, P.wood[1], W1(s, 7)));
  flame(L, cx, cy + s * 0.05, s * 0.3);
  flame(L, cx - s * 0.2, cy + s * 0.12, s * 0.18);
  flame(L, cx + s * 0.2, cy + s * 0.12, s * 0.18);
  const r = rng(3);
  for (let i = 0; i < 8; i++) L.set(cx + (r() - 0.5) * s, cy - s * (0.5 + r() * 0.5), hex('#ffd060'));
}

function meteor(L, cx, cy, s) {
  for (let t = 0; t <= 1; t += 0.02) L.ball(cx + t * s * 0.9, cy - t * s * 0.9, s * 0.18 * (1 - t), s * 0.18 * (1 - t), [hex('#f8702a', 200), hex('#ffb040', 200), hex('#fff0a0', 200)]);
  softGlow(L, cx, cy, s * 0.5, '#ffa040', 180);
  L.ball(cx, cy, s * 0.2, s * 0.2, t3('#3a1a0a', '#7a3a1a', '#c86a2a'));
}

function crater(L, cx, cy, s) {
  L.ball(cx, cy, s * 0.8, s * 0.2, t3('#2a1a10', '#4a3020', '#6a4a30'));
  L.ball(cx, cy + s * 0.02, s * 0.55, s * 0.12, t3('#1a0e08', '#2a1810', '#3a2418'));
  for (let k = 0; k < 6; k++) { const a = Math.PI + (k / 5) * Math.PI; L.ball(cx + Math.cos(a) * s * 0.8, cy + Math.sin(a) * s * 0.35, s * 0.06, s * 0.06, t3('#4a3020', '#6a4a30', '#8a6a40')); }
}

function claws(L, cx, cy, s, c = '#d8303a', n = 3) {
  for (let k = 0; k < n; k++) {
    const dx = (k - (n - 1) / 2) * s * 0.28;
    for (let t = 0; t <= 1; t += 0.02) {
      const w = Math.sin(t * Math.PI) * s * 0.07;
      L.ball(cx + dx + (t - 0.5) * s * 0.5, cy + (t - 0.5) * s * 1.3, w, w, [hex(c), hex(c), hex('#ffffff', 200)]);
    }
  }
}

function roots(L, cx, cy, s, tones = P.bark, seed = 1) {
  const r = rng(seed);
  for (let i = 0; i < 7; i++) {
    let x = cx + (r() - 0.5) * s * 0.4; let y = cy - s * 0.6;
    const dir = (r() - 0.5) * 0.8;
    for (let t = 0; t < 1; t += 0.04) {
      x += Math.sin(t * 6 + i) * s * 0.03 + dir * s * 0.05;
      y += s * 0.06;
      L.ball(x, y, s * 0.07 * (1 - t * 0.7), s * 0.07 * (1 - t * 0.7), tones);
    }
  }
}

function petals(L, cx, cy, s, seed = 1, tones = t3('#8a0a2a', '#d82a4a', '#ff8aa0')) {
  const r = rng(seed);
  for (let i = 0; i < 14; i++) L.ball(cx + (r() - 0.5) * s * 1.8, cy + (r() - 0.5) * s * 1.2, s * 0.09, s * 0.05, tones, { angle: r() * 3 });
  // a rose
  for (let k = 0; k < 6; k++) L.ball(cx + Math.cos(k) * s * 0.12, cy + Math.sin(k) * s * 0.1, s * 0.15, s * 0.13, tones);
  L.ball(cx, cy, s * 0.1, s * 0.09, t3('#5a0218', '#a81a3a', '#e85a7a'));
  L.line(cx, cy + s * 0.15, cx + s * 0.05, cy + s * 0.7, P.leaf[1], W1(s, 14));
  L.ball(cx + s * 0.12, cy + s * 0.45, s * 0.1, s * 0.05, P.leaf, { angle: -0.6 });
}

function antlers(L, cx, cy, s, tones = P.gold) {
  [-1, 1].forEach((d) => {
    const pts = [[cx + d * s * 0.05, cy + s * 0.3], [cx + d * s * 0.25, cy - s * 0.1], [cx + d * s * 0.5, cy - s * 0.5], [cx + d * s * 0.62, cy - s * 0.65]];
    for (let k = 0; k < pts.length - 1; k++) L.line(pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1], tones[1], W1(s, 9));
    L.line(cx + d * s * 0.25, cy - s * 0.1, cx + d * s * 0.15, cy - s * 0.45, tones[2], W1(s, 12));
    L.line(cx + d * s * 0.45, cy - s * 0.42, cx + d * s * 0.32, cy - s * 0.7, tones[2], W1(s, 12));
    L.line(cx + d * s * 0.5, cy - s * 0.5, cx + d * s * 0.75, cy - s * 0.45, tones[2], W1(s, 12));
  });
  L.ball(cx, cy + s * 0.35, s * 0.16, s * 0.1, tones);
}

function sunEmblem(L, cx, cy, s) {
  softGlow(L, cx, cy, s * 0.8, '#ffe080', 170);
  for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; L.line(cx + Math.cos(a) * s * 0.3, cy + Math.sin(a) * s * 0.3, cx + Math.cos(a) * s * 0.55, cy + Math.sin(a) * s * 0.55, hex('#ffd040'), W1(s, 12)); }
  L.ball(cx, cy, s * 0.28, s * 0.28, t3('#e88a10', '#ffc840', '#fff4a0'));
}

function resonator(L, cx, cy, s) {
  for (let k = 1; k <= 3; k++) for (let a = 0; a < Math.PI * 2; a += 0.05) L.set(cx + Math.cos(a) * s * 0.2 * k, cy - s * 0.25 + Math.sin(a) * s * 0.12 * k, hex('#a8f0ff', 200 - k * 50));
  [-1, 1].forEach((d) => L.line(cx + d * s * 0.12, cy - s * 0.45, cx + d * s * 0.12, cy + s * 0.1, P.gold[2], W1(s, 9)));
  L.ball(cx, cy + s * 0.12, s * 0.14, s * 0.08, P.gold);
  L.line(cx, cy + s * 0.18, cx, cy + s * 0.6, P.gold[1], W1(s, 9));
  L.ball(cx, cy - s * 0.25, s * 0.1, s * 0.1, P.ice);
}

function magnifier(L, cx, cy, s) {
  L.line(cx + s * 0.2, cy + s * 0.2, cx + s * 0.55, cy + s * 0.55, P.wood[1], W1(s, 6));
  L.ball(cx, cy, s * 0.32, s * 0.32, P.gold);
  L.ball(cx, cy, s * 0.25, s * 0.25, [hex('#a8e0ff', 150), hex('#d8f4ff', 160), hex('#ffffff', 200)]);
}

function cards(L, cx, cy, s) {
  [-0.3, 0, 0.3].forEach((dx, i) => {
    const x = cx + dx * s; const y = cy + Math.abs(dx) * s * 0.3;
    L.poly([[x - s * 0.18, y - s * 0.28], [x + s * 0.18, y - s * 0.28], [x + s * 0.18, y + s * 0.28], [x - s * 0.18, y + s * 0.28]], i === 1 ? P.gold[1] : hex('#3a2a5a'));
    L.rect(Math.round(x - s * 0.13), Math.round(y - s * 0.22), Math.round(s * 0.26), Math.round(s * 0.44), hex(i === 1 ? '#fff4c0' : '#5a4a8a'));
  });
}

function fishbowl(L, cx, cy, s) {
  L.ball(cx, cy, s * 0.5, s * 0.45, [hex('#a8e0ff', 90), hex('#c8f0ff', 110), hex('#ffffff', 170)]);
  L.ball(cx, cy + s * 0.12, s * 0.45, s * 0.3, [hex('#2a8ad0', 150), hex('#4aa8e8', 150), hex('#8ad0ff', 160)]);
  L.rect(Math.round(cx - s * 0.25), Math.round(cy - s * 0.47), Math.round(s * 0.5), W1(s, 14), hex('#e0f8ff'));
  fish(L, cx - s * 0.05, cy + s * 0.12, s * 0.35, { tones: P.orange, fin: P.orange });
  L.ball(cx, cy + s * 0.45, s * 0.38, s * 0.06, t3('#8a7048', '#c8a870', '#f0d8a0'));
}

function crackedOrb(L, cx, cy, s) {
  softGlow(L, cx, cy, s * 0.8, '#c890ff', 160);
  L.ball(cx - s * 0.12, cy, s * 0.32, s * 0.36, P.purple);
  L.ball(cx + s * 0.22, cy + s * 0.05, s * 0.28, s * 0.32, P.teal);
  for (let t = 0; t < 1; t += 0.05) L.set(cx + s * 0.06 + Math.sin(t * 12) * s * 0.03, cy - s * 0.4 + t * s * 0.85, hex('#ffffff'));
  const r = rng(5);
  for (let i = 0; i < 8; i++) star(L, cx + (r() - 0.5) * s * 1.4, cy + (r() - 0.5) * s, '#e0c8ff');
}

function heartShield(L, cx, cy, s) {
  L.poly([[cx - s * 0.35, cy - s * 0.4], [cx + s * 0.35, cy - s * 0.4], [cx + s * 0.3, cy + s * 0.15], [cx, cy + s * 0.45], [cx - s * 0.3, cy + s * 0.15]], side(P.wood, cx, s, 2));
  L.ball(cx - s * 0.08, cy - s * 0.08, s * 0.1, s * 0.1, P.red);
  L.ball(cx + s * 0.08, cy - s * 0.08, s * 0.1, s * 0.1, P.red);
  L.poly([[cx - s * 0.17, cy - s * 0.04], [cx + s * 0.17, cy - s * 0.04], [cx, cy + s * 0.18]], P.red[1]);
}

function swords(L, cx, cy, s, glow = '#ff6040') {
  softGlow(L, cx, cy, s * 0.8, glow, 150);
  sword(L, cx - s * 0.4, cy + s * 0.45, s, { angle: -0.85, len: 1.0 });
  sword(L, cx + s * 0.4, cy + s * 0.45, s, { angle: -2.29, len: 1.0 });
  L.ball(cx, cy + s * 0.15, s * 0.3, s * 0.35, P.steel);
  L.ball(cx, cy + s * 0.15, s * 0.16, s * 0.2, P.red);
}

function shadow(L, cx, cy, s) {
  softGlow(L, cx, cy, s * 0.9, '#5a2a8a', 120);
  L.poly([[cx - s * 0.3, cy - s * 0.1], [cx + s * 0.3, cy - s * 0.1], [cx + s * 0.55, cy + s * 0.75], [cx + s * 0.2, cy + s * 0.55], [cx, cy + s * 0.8], [cx - s * 0.2, cy + s * 0.55], [cx - s * 0.55, cy + s * 0.75]], [hex('#0a0410', 230)][0]);
  L.ball(cx, cy - s * 0.3, s * 0.2, s * 0.24, [hex('#0a0410', 230), hex('#140820', 230), hex('#1e1030', 230)]);
  [-0.07, 0.07].forEach((dx) => L.set(cx + dx * s, cy - s * 0.32, hex('#ff2a2a')));
}

function wolfHead(L, cx, cy, s, tones = P.grey) {
  head(L, cx, cy, s * 2.2, { head: 'wolf', skin: tones, eye: '#f8d040' });
}

module.exports = {
  P, t3, W1, side, star,
  plain, sky, night, darkForest, underwater, library, swamp, lavaField, snow, meadow, castleHill,
  wings, sword, staff, axe, spear, torch, flame, bookIcon, figure, head, hat,
  dragon, fish, serpent, hydra, owl, spider, roach, tarasca, blob,
  building, chalice, scroll, gear, potion, horn, moonCrescent, vortex, bonfire, meteor, crater, claws, roots, petals, antlers, sunEmblem, resonator, magnifier, cards, fishbowl, crackedOrb, heartShield, swords, shadow, wolfHead,
};
