// Illustrations for the cards of the new sheet that came without an image. Keyed by card number;
// the file name and the art tier come from the card (make.js). Compilaciones are 16-bit.
const { glow: softGlow, hex, gradient } = require('./pixel');
const A = require('./parts');

const { P, t3, figure } = A;
const wasp = (...args) => require('./make').wasp(...args);

// (bg, fg) are the two layers; w/h/s shorthands keep each entry short.
const at = (L, fx, fy) => [L.w * fx, L.h * fy];

module.exports = {
  // ---------- AdB ----------
  4: (bg, fg) => { A.meadow(bg, 4); A.dragon(fg, ...at(fg, 0.48, 0.55), fg.h * 0.42, { tones: t3('#7a9ac8', '#b8d8f8', '#f0f8ff'), baby: true }); },
  9: (bg, fg) => { A.castleHill(bg, 9); A.dragon(fg, ...at(fg, 0.5, 0.55), fg.h * 0.44, { tones: t3('#5a6ab0', '#9ab0e8', '#e0ecff'), tiara: true }); },
  10: (bg, fg) => { A.night(bg, 10, { color: '#c8d8ff' }); A.dragon(fg, ...at(fg, 0.52, 0.56), fg.h * 0.46, { tones: t3('#3a3a8a', '#6a7ad8', '#c8d8ff'), wing: t3('#2a2a6a', '#5a5ab8', '#a8b0f0'), crown: true, aura: '#a8c0ff' }); },
  15: (bg, fg) => { A.sky(bg, 15); A.dragon(fg, ...at(fg, 0.5, 0.56), fg.h * 0.42, { tones: t3('#6a8ac0', '#a8c8f0', '#f0f8ff'), tiara: true }); },
  18: (bg, fg) => {
    A.castleHill(bg, 18, { stops: ['#d8603a', '#f8a86a', '#ffe0a8'] });
    A.dragon(fg, ...at(fg, 0.62, 0.62), fg.h * 0.4, { tones: P.red, wing: t3('#3a0a0a', '#7a1a1a', '#c84a3a'), breath: '#ffa040' });
    figure(fg, ...at(fg, 0.3, 0.5), fg.h * 0.38, { cloth: P.red, armor: true, head: 'helm', eye: '#ffb040', cape: P.red, item: 'spear', shield: P.steel, shieldBoss: P.red });
  },
  29: (bg, fg) => { A.castleHill(bg, 29); for (let k = 0; k < 12; k++) fg.poly([[fg.w * (0.42 - k * 0.012), fg.h * (0.55 + k * 0.04)], [fg.w * (0.58 + k * 0.012), fg.h * (0.55 + k * 0.04)], [fg.w * (0.58 + k * 0.014), fg.h * (0.59 + k * 0.04)], [fg.w * (0.42 - k * 0.014), fg.h * (0.59 + k * 0.04)]], hex(k % 2 ? '#a81a2a' : '#c82a3a')); A.hat(fg, fg.w * 0.5, fg.h * 0.55, fg.h * 1.2, 'crown', { gem: '#3ac0ff' }); },

  // ---------- CdG: goblins and orcs ----------
  31: (bg, fg) => {
    require('./make').stoneWall(bg);
    figure(fg, ...at(fg, 0.42, 0.5), fg.h * 0.4, { head: 'goblin', skin: P.goblin, cloth: P.brown, build: 'small', hat: 'cap', item: 'spear' });
    figure(fg, ...at(fg, 0.66, 0.52), fg.h * 0.36, { head: 'goblin', skin: P.goblin, cloth: P.steel, armor: true, build: 'stocky', hat: 'helmet', shield: P.wood, shieldBoss: P.steel });
  },
  33: (bg, fg) => { A.lavaField(bg); figure(fg, ...at(fg, 0.46, 0.5), fg.h * 0.4, { head: 'goblin', skin: P.goblin, cloth: P.orange, item: 'torch', build: 'small' }); },
  34: (bg, fg) => { require('./make').stoneWall(bg); figure(fg, ...at(fg, 0.5, 0.5), fg.h * 0.4, { head: 'goblin', skin: P.goblin, cloth: P.brown, build: 'small', hat: 'helmet', item: 'spear', shield: P.wood, shieldBoss: P.steel }); },
  36: (bg, fg) => { A.darkForest(bg, 36); figure(fg, ...at(fg, 0.5, 0.5), fg.h * 0.42, { head: 'orc', skin: P.orc, cloth: P.dark, build: 'stocky', hat: 'hood', hood: P.dark, item: 'dagger', eye: '#ff3a2a' }); },
  37: (bg, fg) => {
    A.meadow(bg, 37);
    figure(fg, ...at(fg, 0.32, 0.52), fg.h * 0.36, { head: 'orc', skin: P.orc, cloth: P.red, build: 'stocky', hat: 'helmet', item: 'spear', shield: P.wood, shieldBoss: P.red });
    figure(fg, ...at(fg, 0.66, 0.5), fg.h * 0.38, { head: 'orc', skin: P.orc, cloth: P.red, build: 'stocky', hat: 'helmet', item: 'axe' });
  },
  41: (bg, fg) => {
    A.night(bg, 41, { color: '#d8e0ff' });
    figure(fg, ...at(fg, 0.5, 0.5), fg.h * 0.4, { head: 'goblin', skin: P.goblin, cloth: P.green, cape: P.dark, hat: 'cap', capTones: P.red, item: 'sword', itemGlow: '#a8e0ff' });
  },
  42: (bg, fg) => { A.meadow(bg, 42); figure(fg, ...at(fg, 0.5, 0.5), fg.h * 0.4, { head: 'goblin', skin: P.goblin, cloth: P.green, hat: 'cap', capTones: P.red, item: 'woodSword', build: 'small' }); },
  43: (bg, fg) => { A.meadow(bg, 43); A.building(fg, ...at(fg, 0.5, 0.58), fg.h * 0.42, { tones: t3('#4a5a3a', '#7a8a5a', '#a8b880'), banner: P.green }); },
  44: (bg, fg) => { A.plain(bg, ['#3a2a1a', '#6a4a2a', '#a87a4a']); A.scroll(fg, ...at(fg, 0.46, 0.52), fg.h * 0.6, { map: true }); A.magnifier(fg, ...at(fg, 0.7, 0.4), fg.h * 0.3); },
  45: (bg, fg) => { A.night(bg, 45, { moon: false }); A.building(fg, ...at(fg, 0.5, 0.6), fg.h * 0.45, { kind: 'cathedral', tones: t3('#3a4a2a', '#5a6a3a', '#8a9a5a') }); },
  50: (bg, fg) => { require('./make').stoneWall(bg, { light: '#ff7040' }); figure(fg, ...at(fg, 0.5, 0.5), fg.h * 0.44, { head: 'orc', skin: P.orc, cloth: P.red, build: 'stocky', hat: 'crown', item: 'axe', cape: P.purple, armor: true, emblem: P.red }); },
  52: (bg, fg) => {
    A.plain(bg, ['#1a0e2a', '#3a1a4a', '#6a2a5a']);
    softGlow(bg, bg.w * 0.5, bg.h * 0.4, bg.h * 0.6, '#c860ff', 110);
    figure(fg, ...at(fg, 0.5, 0.5), fg.h * 0.42, { head: 'orc', skin: P.orc, robe: P.purple, build: 'stocky', hat: 'hood', hood: P.purple, item: 'staff', orb: P.green, itemGlow: '#80ff80', offhand: 'flame' });
  },
  53: (bg, fg) => {
    A.lavaField(bg);
    figure(fg, ...at(fg, 0.42, 0.5), fg.h * 0.4, { head: 'goblin', skin: P.goblin, cloth: P.orange, hat: 'cap', capTones: P.red, item: 'sword', blade: P.fire, itemGlow: '#ffa040', offhand: 'flame', aura: '#ff8040' });
  },
  55: (bg, fg) => { A.night(bg, 55); figure(fg, ...at(fg, 0.46, 0.52), fg.h * 0.4, { head: 'goblin', skin: P.goblin, cloth: P.brown, cape: P.dark, hat: 'hood', hood: P.dark, item: 'dagger', build: 'small' }); },
  57: (bg, fg) => {
    A.plain(bg, ['#0a1a2a', '#1a3a5a', '#3a6a8a']);
    softGlow(bg, bg.w * 0.5, bg.h * 0.45, bg.h * 0.6, '#80c0ff', 120);
    figure(fg, ...at(fg, 0.5, 0.5), fg.h * 0.42, { head: 'orc', skin: P.orc, robe: P.blue, build: 'stocky', hat: 'wizard', hatTones: P.blue, item: 'staff', orb: P.ice, itemGlow: '#80e0ff', offhand: 'orb', beard: P.grey });
  },
  60: (bg, fg) => { A.plain(bg, ['#2a1a3a', '#5a2a6a', '#a85ab8']); figure(fg, ...at(fg, 0.5, 0.52), fg.h * 0.4, { head: 'goblin', skin: P.goblin, cloth: P.gold, build: 'small', aura: '#fff080', item: 'staff', orb: P.gold, itemGlow: '#ffe080', hat: 'crown' }); },

  // ---------- CE: insects ----------
  63: (bg, fg) => { require('./make').cave(bg, '#a860ff'); A.spider(bg, ...at(bg, 0.6, 0.5), bg.h * 0.4, { tones: [hex('#6a3a9a', 90), hex('#9a6ad8', 90), hex('#c8a0ff', 90)] }); A.spider(fg, ...at(fg, 0.45, 0.55), fg.h * 0.42, { tones: P.purple, eye: '#80ffff' }); },
  67: (bg, fg) => { A.plain(bg, ['#3a2a1a', '#5a4026', '#8a6a3a']); A.roach(fg, ...at(fg, 0.55, 0.55), fg.h * 0.45); },
  68: (bg, fg) => { require('./make').forest(bg, 68); wasp(fg, ...at(fg, 0.5, 0.5), fg.h * 0.42); A.magnifier(fg, ...at(fg, 0.2, 0.62), fg.h * 0.18); },
  75: (bg, fg) => {
    require('./make').cave(bg, '#c03aff');
    A.spider(fg, ...at(fg, 0.55, 0.62), fg.h * 0.32, { tones: P.dark, eye: '#ff3aff' });
    wasp(fg, ...at(fg, 0.48, 0.4), fg.h * 0.4, { crown: true });
  },

  // ---------- DsF ----------
  101: (bg, fg) => {
    A.swamp(bg, 101);
    figure(fg, ...at(fg, 0.48, 0.5), fg.h * 0.42, { head: 'skull', skin: P.bone, cloth: P.bone, ribs: true, pants: P.bone, eye: '#80ff40', aura: '#60ff40' });
    for (let k = 0; k < 4; k++) A.roots(fg, fg.w * (0.35 + k * 0.1), fg.h * 0.5, fg.h * 0.25, t3('#2a4a1a', '#4a7a2a', '#8ac04a'), k + 3);
  },
  109: (bg, fg) => { require('./make').stoneWall(bg, { light: '#80c0ff' }); figure(fg, ...at(fg, 0.5, 0.5), fg.h * 0.42, { head: 'helm', armor: true, eye: '#80f0ff', item: 'sword', shield: P.steel, aura: '#4080c0' }); },

  // ---------- EdC ----------
  136: (bg, fg) => { A.plain(bg, ['#0a0204', '#1a0408', '#3a0a10']); A.claws(fg, ...at(fg, 0.5, 0.5), fg.h * 0.6); },
  148: (bg, fg) => { A.plain(bg, ['#0a0206', '#2a0a14', '#5a1424']); softGlow(bg, bg.w * 0.5, bg.h * 0.45, bg.h * 0.5, '#ff3040', 110); A.chalice(fg, ...at(fg, 0.5, 0.52), fg.h * 0.62); },
  152: (bg, fg) => {
    A.snow(bg, 152);
    figure(fg, ...at(fg, 0.5, 0.5), fg.h * 0.42, { cloth: P.ice, armor: true, emblem: P.ice, hair: t3('#c8d8f0', '#e8f0ff', '#ffffff'), cape: P.blue, item: 'sword', blade: P.ice, itemGlow: '#c0f0ff', shield: P.ice, shieldBoss: P.blue });
  },
  159: (bg, fg) => { A.plain(bg, ['#1a0606', '#3a0e0a', '#6a1a10']); A.swords(fg, ...at(fg, 0.5, 0.45), fg.h * 0.45); },
  160: (bg, fg) => { A.night(bg, 160, { moon: false }); A.moonCrescent(fg, ...at(fg, 0.5, 0.45), fg.h * 0.7, t3('#a81a2a', '#e83a4a', '#ff9aa0'), '#141a3a'); for (let k = 0; k < 3; k++) A.wings(fg, fg.w * (0.2 + k * 0.3), fg.h * (0.75 - (k % 2) * 0.1), fg.h * 0.1, 'bat'); },

  // ---------- IdL ----------
  173: (bg, fg) => { require('./make').forest(bg, 173); figure(fg, ...at(fg, 0.5, 0.48), fg.h * 0.4, { legs: 'goat', cloth: P.green, hair: P.brown, hat: 'goatHorns', item: 'bow', eye: '#c81a1a' }); },
  177: (bg, fg) => { A.plain(bg, ['#0a0614', '#1a1030', '#2a1a4a']); A.crackedOrb(fg, ...at(fg, 0.5, 0.5), fg.h * 0.6); },
  179: (bg, fg) => { A.meadow(bg, 179); A.heartShield(fg, ...at(fg, 0.5, 0.5), fg.h * 0.6); },
  183: (bg, fg) => { A.sky(bg, 183, ['#f8e0a0', '#fff0c8', '#ffffff']); figure(fg, ...at(fg, 0.5, 0.5), fg.h * 0.4, { skin: P.green, cloth: P.white, robe: P.white, wings: 'feather', item: 'sword', blade: P.gold, itemGlow: '#fff080', aura: '#fff4a0', hair: P.white }); },
  186: (bg, fg) => { A.plain(bg, ['#000000', '#0a0414', '#140828']); A.vortex(fg, ...at(fg, 0.5, 0.5), fg.h * 0.6); },
  187: (bg, fg) => { A.night(bg, 187, { moon: false }); A.bonfire(fg, ...at(fg, 0.5, 0.62), fg.h * 0.45); },
  194: (bg, fg) => { A.plain(bg, ['#1a1028', '#2a1a3a', '#4a3a5a']); A.shadow(fg, ...at(fg, 0.5, 0.45), fg.h * 0.5); },

  // ---------- NdM ----------
  200: (bg, fg) => { A.plain(bg, ['#3a1a0a', '#a85a1a', '#f8c060']); A.antlers(fg, ...at(fg, 0.5, 0.58), fg.h * 0.45); },
  201: (bg, fg) => { A.plain(bg, ['#5a2a0a', '#e8901a', '#fff0a0']); A.sunEmblem(fg, ...at(fg, 0.5, 0.35), fg.h * 0.45); A.sword(fg, fg.w * 0.5, fg.h * 0.92, fg.h, { angle: -Math.PI / 2, len: 0.75, blade: P.gold, guard: P.red }); },
  202: (bg, fg) => { A.plain(bg, ['#0a1a3a', '#1a4a7a', '#4a9ad0']); A.resonator(fg, ...at(fg, 0.5, 0.48), fg.h * 0.65); },
  203: (bg, fg) => { A.underwater(bg, 203); A.fish(fg, ...at(fg, 0.48, 0.5), fg.h * 0.5, { kind: 'small', tones: P.blue, fin: P.teal }); fg.ball(fg.w * 0.2, fg.h * 0.3, fg.h * 0.06, fg.h * 0.06, [hex('#c8f0ff', 140), hex('#e0f8ff', 160), hex('#ffffff', 200)]); },
  204: (bg, fg) => { A.sky(bg, 204, ['#f8c0e0', '#ffe0f0', '#fff8ff']); A.wings(fg, fg.w * 0.5, fg.h * 0.45, fg.h * 0.4, 'fairy'); A.blob(fg, ...at(fg, 0.5, 0.55), fg.h * 0.55, P.pink); },
  205: (bg, fg) => { A.lavaField(bg); softGlow(bg, bg.w * 0.5, bg.h * 0.5, bg.h * 0.5, '#ffa040', 150); A.flame(fg, fg.w * 0.5, fg.h * 0.62, fg.h * 0.3); A.blob(fg, fg.w * 0.5, fg.h * 0.62, fg.h * 0.4, P.fire); },
  207: (bg, fg) => { A.library(bg, { light: '#ffe8a0' }); A.bookIcon(fg, ...at(fg, 0.5, 0.5), fg.h * 0.75, P.gold); fg.rect(Math.round(fg.w * 0.47), Math.round(fg.h * 0.32), 2, Math.round(fg.h * 0.3), hex('#fff8e0')); fg.rect(Math.round(fg.w * 0.42), Math.round(fg.h * 0.4), Math.round(fg.w * 0.12), 2, hex('#fff8e0')); },
  208: (bg, fg) => { A.library(bg, { light: '#a8d8ff' }); A.bookIcon(fg, ...at(fg, 0.5, 0.5), fg.h * 0.75, P.blue); fg.poly([[fg.w * 0.52, fg.h * 0.28], [fg.w * 0.44, fg.h * 0.5], [fg.w * 0.5, fg.h * 0.5], [fg.w * 0.45, fg.h * 0.7], [fg.w * 0.56, fg.h * 0.44], [fg.w * 0.5, fg.h * 0.44]], hex('#fff060')); },
  209: (bg, fg) => { A.library(bg); figure(fg, ...at(fg, 0.5, 0.5), fg.h * 0.42, { skin: P.pale, robe: P.purple, hair: t3('#a8a8b0', '#d8d8e0', '#ffffff'), hairStyle: 'long', glasses: true, item: 'staff', orb: P.purple, offhand: 'book', cover2: P.red, hat: 'wizard', hatTones: P.purple }); },
  210: (bg, fg) => { A.library(bg); figure(fg, ...at(fg, 0.5, 0.5), fg.h * 0.42, { skin: P.pale, robe: P.blue, hair: t3('#5a2a10', '#8a4a20', '#c87a3a'), hairStyle: 'long', item: 'book', cover: P.red, offhand: 'book', cover2: P.green }); },
  212: (bg, fg) => { A.plain(bg, ['#0a1a3a', '#1a3a6a', '#2a5a9a']); A.scroll(fg, ...at(fg, 0.5, 0.5), fg.h * 0.7, { ink: '#1a3a8a' }); A.sunEmblem(fg, ...at(fg, 0.78, 0.3), fg.h * 0.22); },
  215: (bg, fg) => { A.lavaField(bg); figure(fg, ...at(fg, 0.5, 0.5), fg.h * 0.42, { skin: P.skin, cloth: P.orange, robe: P.fire, flameHair: true, hat: 'tiara', gem: '#ffe040', aura: '#ff9040', offhand: 'flame', item: 'staff', orb: P.fire, itemGlow: '#ffb040' }); },
  216: (bg, fg) => { A.night(bg, 216, { moon: false }); gradient(bg, [hex('#3a2418'), hex('#1a0e08')], { y0: Math.round(bg.h * 0.75) }); A.crater(fg, ...at(fg, 0.42, 0.82), fg.h * 0.5); A.meteor(fg, ...at(fg, 0.42, 0.55), fg.h * 0.5); },
  217: (bg, fg) => { A.library(bg, { light: '#ffd890' }); A.bookIcon(fg, ...at(fg, 0.5, 0.6), fg.h * 0.6, P.brown, { open: true }); A.star(fg, fg.w * 0.5, fg.h * 0.35, '#fff080'); softGlow(fg, fg.w * 0.5, fg.h * 0.4, fg.h * 0.25, '#fff4a0', 160); },
  220: (bg, fg) => { A.library(bg); figure(fg, ...at(fg, 0.5, 0.5), fg.h * 0.42, { skin: P.skin, robe: P.green, hair: P.brown, glasses: true, beard: P.brown, item: 'book', cover: P.blue }); },
  224: (bg, fg) => { A.underwater(bg, 224, ['#1a4a6a', '#0e2a4a', '#061428']); A.bookIcon(fg, ...at(fg, 0.5, 0.5), fg.h * 0.75, P.teal); fg.ball(fg.w * 0.5, fg.h * 0.45, fg.h * 0.08, fg.h * 0.12, P.gold); fg.line(fg.w * 0.5, fg.h * 0.33, fg.w * 0.5, fg.h * 0.62, P.gold[1]); },
  225: (bg, fg) => { A.plain(bg, ['#0a0206', '#1a0a10', '#2a1420']); softGlow(bg, bg.w * 0.5, bg.h * 0.5, bg.h * 0.5, '#60ff60', 100); A.bookIcon(fg, ...at(fg, 0.5, 0.5), fg.h * 0.75, t3('#2a1a10', '#4a3020', '#6a4a30')); A.head(fg, fg.w * 0.48, fg.h * 0.5, fg.h * 0.6, { head: 'skull', eye: '#60ff60' }); },

  // ---------- PAO ----------
  230: (bg, fg) => { A.meadow(bg, 230); figure(fg, ...at(fg, 0.5, 0.5), fg.h * 0.4, { cloth: P.blue, hair: t3('#8a5a1a', '#c88a3a', '#f0c070'), item: 'woodSword', shield: P.wood, shieldBoss: P.blue, build: 'small' }); },
  243: (bg, fg) => { A.underwater(bg, 243, ['#2a8ab0', '#1a6a8a', '#0a3a5a']); softGlow(bg, bg.w * 0.5, bg.h * 0.5, bg.h * 0.5, '#fff0a0', 110); A.fish(fg, ...at(fg, 0.46, 0.5), fg.h * 0.55, { tones: P.white, fin: t3('#c8c8d8', '#f0f0ff', '#ffffff'), spots: P.orange, whiskers: true, seed: 5 }); },
  245: (bg, fg) => { A.underwater(bg, 245, ['#1a5a8a', '#0e3a5a', '#061a30']); A.fish(fg, ...at(fg, 0.45, 0.5), fg.h * 0.5, { kind: 'shark', tones: P.grey, fin: P.grey }); },
  249: (bg, fg) => { A.underwater(bg, 249); A.fish(fg, ...at(fg, 0.5, 0.42), fg.h * 0.5, { kind: 'manta', tones: t3('#1a2a4a', '#3a5a8a', '#7a9ac8') }); },
  251: (bg, fg) => { A.swamp(bg, 251); A.hydra(fg, ...at(fg, 0.55, 0.55), fg.h * 0.45, { tones: P.teal }); },
  252: (bg, fg) => { A.plain(bg, ['#2a1a10', '#5a3a20', '#8a6a3a']); A.fishbowl(fg, ...at(fg, 0.5, 0.5), fg.h * 0.6); },

  // ---------- SBE: Bosque Oscuro ----------
  261: (bg, fg) => { A.darkForest(bg, 261); A.owl(fg, ...at(fg, 0.5, 0.48), fg.h * 0.38, { tones: t3('#2a1e2a', '#4a3a4a', '#7a6a7a'), eyes: '#c0ff60', spread: true }); },
  263: (bg, fg) => { A.darkForest(bg, 263); A.serpent(fg, ...at(fg, 0.5, 0.5), fg.h * 0.45, { tones: P.green, wings: true, crest: hex('#d8203a') }); },
  265: (bg, fg) => { A.darkForest(bg, 265, { fog: '#a8b8c8' }); figure(fg, ...at(fg, 0.5, 0.5), fg.h * 0.4, { robe: P.grey, hat: 'wizard', hatTones: P.dark, beard: P.white, item: 'staff', orb: P.ice, itemGlow: '#a8e0ff' }); },
  266: (bg, fg) => { A.swamp(bg, 266); for (let k = 0; k < 3; k++) fg.ball(fg.w * (0.3 + k * 0.2), fg.h * (0.7 - (k % 2) * 0.05), fg.h * 0.06, fg.h * 0.06, t3('#4a6a1a', '#7a9a2a', '#b8d84a')); A.roots(fg, ...at(fg, 0.5, 0.7), fg.h * 0.35, P.moss, 6); },
  267: (bg, fg) => { A.plain(bg, ['#2a0a14', '#5a1a2a', '#8a2a3a']); A.petals(fg, ...at(fg, 0.5, 0.45), fg.h * 0.5); },
  269: (bg, fg) => { A.darkForest(bg, 269, { eyes: false }); A.roots(fg, ...at(fg, 0.5, 0.45), fg.h * 0.7, P.bark, 2); },
  270: (bg, fg) => { A.darkForest(bg, 270); A.building(bg, ...at(bg, 0.25, 0.55), bg.h * 0.5, { kind: 'tower', tones: P.bark }); figure(fg, ...at(fg, 0.6, 0.5), fg.h * 0.4, { skin: P.pale, cloth: P.green, wings: 'fairy', hair: P.leaf, hairStyle: 'long', item: 'spear', hat: 'leaves' }); },
  271: (bg, fg) => { A.darkForest(bg, 271); figure(fg, ...at(fg, 0.5, 0.48), fg.h * 0.42, { legs: 'goat', cloth: P.moss, hair: P.moss, beard: P.moss, hat: 'antlers', wings: 'fairy', item: 'staff', orb: P.leaf, itemGlow: '#a8ff80' }); },
  272: (bg, fg) => { A.plain(bg, ['#1a120a', '#3a2a1a', '#5a4428']); A.gear(fg, ...at(fg, 0.5, 0.5), fg.h * 0.8); A.gear(fg, ...at(fg, 0.22, 0.25), fg.h * 0.3, P.steel, 8); },
  274: (bg, fg) => { A.darkForest(bg, 274); require('./make').treeGuardian(fg, ...at(fg, 0.5, 0.5), fg.h * 0.55); softGlow(bg, bg.w * 0.5, bg.h * 0.45, bg.h * 0.5, '#80ff80', 90); },
  276: (bg, fg) => { A.plain(bg, ['#0a1a10', '#1a3a20', '#2a5a30']); A.potion(fg, ...at(fg, 0.5, 0.5), fg.h * 0.6, t3('#1a8a3a', '#3ad85a', '#a8ffa8'), '#8aff8a'); },
  277: (bg, fg) => { A.darkForest(bg, 277, { eyes: false }); A.roots(fg, ...at(fg, 0.5, 0.35), fg.h * 0.6, t3('#1a1008', '#3a2414', '#5a3a20'), 9); A.roots(fg, ...at(fg, 0.35, 0.4), fg.h * 0.5, P.moss, 11); },
  278: (bg, fg) => { A.darkForest(bg, 278); softGlow(fg, fg.w * 0.5, fg.h * 0.55, fg.h * 0.35, '#80ff80', 60); for (let k = 0; k < 5; k++) { fg.set(fg.w * (0.2 + k * 0.15), fg.h * (0.4 + (k % 2) * 0.15), hex('#c0ff60')); fg.set(fg.w * (0.2 + k * 0.15) + 2, fg.h * (0.4 + (k % 2) * 0.15), hex('#c0ff60')); } },
  284: (bg, fg) => { A.plain(bg, ['#0a1a0a', '#1a3a14', '#3a6a2a']); require('./make').vineEmblem(fg, ...at(fg, 0.5, 0.5), fg.h * 0.42); A.claws(fg, ...at(fg, 0.5, 0.5), fg.h * 0.4, '#a8ff60', 2); },
  286: (bg, fg) => { A.darkForest(bg, 286); figure(fg, ...at(fg, 0.5, 0.5), fg.h * 0.42, { robe: P.moss, hat: 'hood', hood: P.moss, beard: P.white, item: 'staff', orb: P.leaf, itemGlow: '#a8ff80', offhand: 'book', cover2: P.green, aura: '#80c060' }); },
  287: (bg, fg) => { A.darkForest(bg, 287, { fog: '#80c0d0' }); gradient(bg, [hex('#2a6a8a'), hex('#1a4a6a')], { y0: Math.round(bg.h * 0.8) }); figure(fg, ...at(fg, 0.5, 0.48), fg.h * 0.4, { skin: P.pale, robe: P.teal, hair: t3('#c8a020', '#f0d050', '#fff0a0'), hairStyle: 'long', offhand: 'orb', orb2: P.ice, item: 'lantern' }); },
  290: (bg, fg) => { A.swamp(bg, 290); A.tarasca(fg, ...at(fg, 0.52, 0.55), fg.h * 0.5); },

  // ---------- TP ----------
  298: (bg, fg) => { A.night(bg, 298, { color: '#e0e8ff' }); A.claws(fg, ...at(fg, 0.5, 0.55), fg.h * 0.55, '#c8d0e0', 4); },
  304: (bg, fg) => { A.plain(bg, ['#1a1430', '#2a2450', '#4a3a7a']); A.cards(fg, ...at(fg, 0.45, 0.55), fg.h * 0.55); A.magnifier(fg, ...at(fg, 0.62, 0.42), fg.h * 0.35); },
  306: (bg, fg) => { A.night(bg, 306); figure(fg, ...at(fg, 0.5, 0.5), fg.h * 0.42, { head: 'wolf', skin: P.grey, cloth: P.steel, armor: true, emblem: P.grey, build: 'stocky', shield: P.steel, shieldBoss: P.gold, item: 'axe', eye: '#f8d040' }); },
  311: (bg, fg) => { A.meadow(bg, 311); A.horn(fg, ...at(fg, 0.45, 0.5), fg.h * 0.55, P.gold); },
  312: (bg, fg) => { A.plain(bg, ['#2a1a1a', '#5a2a2a', '#8a4a3a']); A.horn(fg, ...at(fg, 0.45, 0.5), fg.h * 0.55, P.bone); },
};
