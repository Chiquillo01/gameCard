const { connectDB, disconnectDB } = require('../../mongo/connection');
const { Card } = require('../../data/Schema/card');
const { Effect } = require('../../data/Schema/effect');
const { Deck } = require('../../data/Schema/deck');
const { User } = require('../../data/Schema/user');
const cards = require('../../data/seed/cards_final.json');
const effects = require('../../data/seed/effects_final.json');
const { createMatch, applyAction, viewFor } = require('../../game/engine');
const { placeMonster, moveToZone, findInstanceLocation } = require('../../game/zones');
const { addStatus, hasStatus, FREEZE, BURN, POISON } = require('../../game/statuses');
const { recomputeContinuous } = require('../../game/effectEngine');

beforeAll(async () => {
  await connectDB();
  await Promise.all(effects.map((e) => Effect.findByIdAndUpdate(e._id, e, { upsert: true })));
  for (let i = 0; i < cards.length; i++) {
    await Card.findOneAndUpdate({ name: cards[i].name }, { ...cards[i], number: i + 1 }, { upsert: true });
  }
});

afterAll(async () => {
  await disconnectDB();
});

// Player A's deck is exactly `namesA` (x1 each) so they all start in hand; B gets `namesB` (x2).
const PLAIN = ['Carnivora Come Hombres', 'El Primer Ginete', 'Dragón de Oscuridad Bebe', 'Inferno, el Dragón de Fuego', 'Oscuro, el Dragón de Oscuridad', 'Roco, el Dragón de Tierra', 'Sky, el Dragón de Viento', 'Capitán Bandido'];

async function makeMatch(namesA, namesB = PLAIN) {
  const build = async (tag, names, amount) => {
    const docs = await Card.find({ name: { $in: names } }).lean();
    const byName = new Map(docs.map((c) => [c.name, c]));
    const user = await User.create({ userName: `St${tag}${Date.now()}`, email: `st${tag}${Date.now()}@example.com`, password: 'x' });
    const deck = await Deck.create({ deckTitle: tag, owner: user._id, cards: names.map((n) => ({ card: byName.get(n)._id, amount })), fusionCards: [] });
    return { user, byName, deck: await Deck.findById(deck._id).populate('cards.card').populate('fusionCards.card') };
  };
  const a = await build('A', namesA, 1);
  const b = await build('B', namesB, 1);
  const state = await createMatch({
    matchId: `st-${Date.now()}-${Math.random()}`,
    playerA: a.user._id.toString(),
    deckA: a.deck,
    playerB: b.user._id.toString(),
    deckB: b.deck,
    vsBot: false,
  });
  const inHand = (name) => state.players[0].hand.find((id) => id.split(':')[1] === a.byName.get(name)._id.toString());
  return { state, inHand, byNameB: b.byName };
}

function advanceUntil(state, turn, phase) {
  let guard = 0;
  while ((state.turnNumber < turn || state.phase !== phase) && guard++ < 80) {
    applyAction(state, state.turnPlayer, { type: 'ADVANCE_PHASE' });
  }
}

const monsterOf = (state, playerIndex, instanceId) => state.players[playerIndex].field.monsters.find((m) => m && m.instanceId === instanceId);
// Tiny test decks would deck out on a later draw, so pad both with spare copies of a plain monster.
function padDecks(state) {
  state.players.forEach((pl, p) => {
    const cardId = [...pl.hand, ...pl.deck][0].split(':')[1];
    for (let i = 0; i < 6; i++) pl.deck.push(`${p}:${cardId}:pad${i}`);
  });
}
const COMPILE_NAMES = ['Ciempiés Gigante', 'Avispa gigante', 'Avispa Mutante'];

async function compiled() {
  const ctx = await makeMatch(COMPILE_NAMES);
  padDecks(ctx.state);
  const fusionId = ctx.inHand('Ciempiés Gigante');
  const mats = [ctx.inHand('Avispa gigante'), ctx.inHand('Avispa Mutante')];
  const res = applyAction(ctx.state, 0, { type: 'COMPILE_SUMMON', instanceId: fusionId, materialInstanceIds: mats });
  expect(res.ok).toBe(true);
  return { ...ctx, fusionId, mats };
}

describe('Compiled monsters keep their materials', () => {
  it('stacks the materials under the compiled monster instead of sending them to the graveyard', async () => {
    const { state, fusionId, mats } = await compiled();
    expect(monsterOf(state, 0, fusionId).materials).toEqual(mats);
    mats.forEach((id) => expect(findInstanceLocation(state, id)).toBeNull());
    expect(state.players[0].graveyard).toEqual([]);
    const view = viewFor(state, 0).players[0].field.monsters.find((m) => m && m.instanceId === fusionId);
    expect(view.materialCount).toBe(2);
  });

  it('sends the materials to the graveyard when the compiled monster is destroyed', async () => {
    const { state, fusionId, mats } = await compiled();
    moveToZone(state, fusionId, 'graveyard');
    expect(state.players[0].graveyard).toEqual(expect.arrayContaining([fusionId, ...mats]));
  });

  it('sends the materials to the Mazo when the compiled monster goes back to the Mazo-C', async () => {
    const { state, fusionId, mats } = await compiled();
    moveToZone(state, fusionId, 'extra');
    expect(state.players[0].extra).toContain(fusionId);
    mats.forEach((id) => expect(state.players[0].deck).toContain(id));
  });

  it('refuses to compile when there is no free zone, without consuming any material', async () => {
    const { state, inHand } = await makeMatch(COMPILE_NAMES);
    const filler = [...state.players[1].hand, ...state.players[1].deck].slice(0, 5);
    filler.forEach((id) => placeMonster(state, id, 0, { position: 'attack' }));
    const res = applyAction(state, 0, {
      type: 'COMPILE_SUMMON',
      instanceId: inHand('Ciempiés Gigante'),
      materialInstanceIds: [inHand('Avispa gigante'), inHand('Avispa Mutante')],
    });
    expect(res).toMatchObject({ ok: false, reason: 'no-field-space' });
    expect(state.players[0].hand).toContain(inHand('Avispa gigante'));
  });
});

describe('Decompiling', () => {
  it('is refused outside the Battle Phase and on the turn it was compiled', async () => {
    const { state, fusionId } = await compiled();
    expect(applyAction(state, 0, { type: 'DECOMPILE', instanceId: fusionId })).toMatchObject({ ok: false, reason: 'not-battle-phase' });
  });

  it('is refused the turn the monster was compiled, even in the Battle Phase', async () => {
    const { state, fusionId } = await compiled();
    state.turnNumber = 3; // first turn has no Battle Phase; simulate a later turn's compile
    state.firstTurn = false;
    monsterOf(state, 0, fusionId).summonedTurn = 3;
    state.phase = 'battle';
    expect(applyAction(state, 0, { type: 'DECOMPILE', instanceId: fusionId })).toMatchObject({ ok: false, reason: 'compiled-this-turn' });
  });

  it('sends the compiled monster to the Mazo-C and summons the materials back on a later turn', async () => {
    const { state, fusionId, mats } = await compiled();
    advanceUntil(state, 3, 'battle');
    const res = applyAction(state, 0, { type: 'DECOMPILE', instanceId: fusionId });;
    expect(res.ok).toBe(true);
    expect(state.players[0].extra).toContain(fusionId);
    expect(monsterOf(state, 0, fusionId)).toBeUndefined();
    mats.forEach((id) => expect(monsterOf(state, 0, id)).toBeDefined());
    expect(state.players[0].deck).not.toEqual(expect.arrayContaining(mats));
  });

  it('is refused when the materials would not fit on the field', async () => {
    const { state, fusionId } = await compiled();
    advanceUntil(state, 3, 'battle');
    const pool = [...state.players[1].hand, ...state.players[1].deck];
    pool.slice(0, 3).forEach((id) => placeMonster(state, id, 0, { position: 'attack' }));
    // 1 compiled + 3 fillers = 4 used, 1 empty + the compiled's own zone = 2 free, 2 materials -> fits.
    pool.slice(3, 4).forEach((id) => placeMonster(state, id, 0, { position: 'attack' }));
    // Now 5 used: only the compiled's own zone frees up, for 2 materials.
    expect(applyAction(state, 0, { type: 'DECOMPILE', instanceId: fusionId })).toMatchObject({ ok: false, reason: 'no-field-space' });
    expect(monsterOf(state, 0, fusionId)).toBeDefined();
  });
});

// Two of the (few) monsters left with no effectCodes at all: these tests hardcode exact VP/Atk
// math, so a card that happens to carry its own continuous effect (several PLAIN monsters do,
// e.g. Capitán Bandido's battle-destruction immunity) would silently throw the numbers off
// depending on which one the shuffle put first in hand.
const VANILLA = ['Esqueleto', 'Valkiria'];

async function twoMonsters() {
  const { state } = await makeMatch(VANILLA, VANILLA);
  padDecks(state); // several of these tests advance multiple turns' worth of draws
  const [aId, bId] = [state.players[0].hand[0], state.players[1].hand[0]];
  placeMonster(state, aId, 0, { position: 'attack' });
  placeMonster(state, bId, 1, { position: 'attack' });
  return { state, aId, bId };
}

describe('Quemadura', () => {
  it('costs 5 VP per burning monster at the end of every turn and wears off after the turn', async () => {
    const { state, aId } = await twoMonsters();
    advanceUntil(state, 1, 'main1');
    addStatus(state, aId, BURN);
    const before = state.players[0].vp;
    advanceUntil(state, 2, 'draw');
    expect(state.players[0].vp).toBe(before - 5);
    expect(hasStatus(state, aId, BURN)).toBe(false);
  });

  it('lasts two turns when it comes from a compiled monster', async () => {
    const { state, aId } = await twoMonsters();
    addStatus(state, aId, BURN, { fromCompiled: true });
    const before = state.players[0].vp;
    advanceUntil(state, 3, 'draw');
    expect(state.players[0].vp).toBe(before - 10);
    expect(hasStatus(state, aId, BURN)).toBe(false);
  });

  it('doubles the damage a burning monster takes in battle', async () => {
    const { state, aId, bId } = await twoMonsters();
    advanceUntil(state, 3, 'battle');
    monsterOf(state, 0, aId).baseAtk = 6;
    monsterOf(state, 1, bId).baseAtk = 2;
    addStatus(state, bId, BURN);
    const res = applyAction(state, 0, { type: 'DECLARE_ATTACK', attackerInstanceId: aId, targetInstanceId: bId });
    expect(res.destroyedDefender).toBe(true);
    expect(state.players[1].vp).toBe(80 - 8); // (6 - 2) x 2
  });

  it('stops burning when the monster is destroyed', async () => {
    const { state, aId } = await twoMonsters();
    addStatus(state, aId, BURN);
    moveToZone(state, aId, 'graveyard');
    expect(hasStatus(state, aId, BURN)).toBe(false);
  });
});

describe('Congelado', () => {
  it('stops the monster from activating effects', async () => {
    const { state, aId } = await twoMonsters();
    addStatus(state, aId, FREEZE);
    const res = applyAction(state, 0, { type: 'ACTIVATE_EFFECT', effectId: 'DESCOMPILACION', sourceInstanceId: aId });
    expect(res).toMatchObject({ ok: false, reason: 'frozen' });
  });

  it('keeps the frozen status on the card in the graveyard', async () => {
    const { state, aId } = await twoMonsters();
    addStatus(state, aId, FREEZE, { fromCompiled: true });
    moveToZone(state, aId, 'graveyard');
    expect(hasStatus(state, aId, FREEZE)).toBe(true);
  });

  it('destroys a frozen attacker that hits a water monster, before damage', async () => {
    const { state, aId, bId } = await twoMonsters();
    advanceUntil(state, 3, 'battle');
    addStatus(state, aId, FREEZE);
    monsterOf(state, 1, bId).cardId = (await Card.findOne({ name: 'Kraken' }).lean())._id.toString();
    const vp = state.players.map((p) => p.vp);
    applyAction(state, 0, { type: 'DECLARE_ATTACK', attackerInstanceId: aId, targetInstanceId: bId });
    expect(monsterOf(state, 0, aId)).toBeUndefined();
    expect(state.players.map((p) => p.vp)).toEqual(vp);
  });

  it('destroys a frozen defender attacked by a water monster', async () => {
    const { state, aId, bId } = await twoMonsters();
    advanceUntil(state, 3, 'battle');
    addStatus(state, bId, FREEZE);
    monsterOf(state, 0, aId).cardId = (await Card.findOne({ name: 'Kraken' }).lean())._id.toString();
    applyAction(state, 0, { type: 'DECLARE_ATTACK', attackerInstanceId: aId, targetInstanceId: bId });
    expect(monsterOf(state, 1, bId)).toBeUndefined();
    expect(monsterOf(state, 0, aId)).toBeDefined();
  });
});

describe('Envenenado', () => {
  it('lowers Atk and Vida by the amount the status carries while it lasts', async () => {
    const { state, aId } = await twoMonsters();
    const base = monsterOf(state, 0, aId).baseAtk;
    addStatus(state, aId, POISON, { debuff: { atk: -1, def: -1 } });
    recomputeContinuous(state);
    expect(monsterOf(state, 0, aId).tempBuff.atk).toBe(-1);
    advanceUntil(state, 2, 'draw');
    recomputeContinuous(state);
    expect(monsterOf(state, 0, aId).tempBuff.atk).toBe(0);
    expect(monsterOf(state, 0, aId).baseAtk).toBe(base);
  });
});
