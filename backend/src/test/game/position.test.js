const { connectDB, disconnectDB } = require('../../mongo/connection');
const { Card } = require('../../data/Schema/card');
const { Effect } = require('../../data/Schema/effect');
const { Deck } = require('../../data/Schema/deck');
const { User } = require('../../data/Schema/user');
const cards = require('../../data/seed/cards_final.json');
const effects = require('../../data/seed/effects_final.json');
const { createMatch, applyAction } = require('../../game/engine');

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

// Free-to-summon AND effect-free monsters, so combat math in these tests is just raw ATK vs
// raw ATK/Vida. The real card set has almost no vanilla monsters left (nearly every card has an
// effect now), so the tests mint a dozen copies of a vanilla one under their own names.
async function getVanillaFreeMonsters(limit = 20) {
  const base = await Card.findOne({ name: 'Esqueleto' }).lean();
  const { _id, createdAt, updatedAt, __v, ...rest } = base;
  for (let i = 1; i <= 12; i++) {
    await Card.findOneAndUpdate({ name: `Vanilla ${i}` }, { ...rest, name: `Vanilla ${i}`, number: 1000 + i, effectCodes: [] }, { upsert: true });
  }
  return Card.find({ name: /^Vanilla / }).limit(limit).lean();
}

async function makeMatch() {
  const free = await getVanillaFreeMonsters();
  const mk = async (tag) => {
    const user = await User.create({ userName: `Pos${tag}${Date.now()}`, email: `pos${tag}${Date.now()}@example.com`, password: 'x' });
    const deck = await Deck.create({ deckTitle: tag, owner: user._id, cards: free.map((c) => ({ card: c._id, amount: 2 })), fusionCards: [] });
    return { user, deck: await Deck.findById(deck._id).populate('cards.card').populate('fusionCards.card') };
  };
  const a = await mk('A');
  const b = await mk('B');
  return createMatch({
    matchId: `pos-${Date.now()}-${Math.random()}`,
    playerA: a.user._id.toString(),
    deckA: a.deck,
    playerB: b.user._id.toString(),
    deckB: b.deck,
    vsBot: false,
  });
}

function advanceUntil(state, turn, phase) {
  let guard = 0;
  while ((state.turnNumber < turn || state.phase !== phase) && guard++ < 80) {
    applyAction(state, state.turnPlayer, { type: 'ADVANCE_PHASE' });
  }
}

const monsterOf = (state, playerIndex, instanceId) => state.players[playerIndex].field.monsters.find((m) => m && m.instanceId === instanceId);

// P0 has an attack-position monster from turn 1; P1 summons a defender on turn 2; then it's P0's
// turn-3 battle phase with hand-picked stats.
async function battleSetup({ atk, def, defenderOpts }) {
  const state = await makeMatch();
  const attackerId = state.players[0].hand[0];
  applyAction(state, 0, { type: 'NORMAL_SUMMON', instanceId: attackerId, position: 'attack' });
  advanceUntil(state, 2, 'main1');
  const defenderId = state.players[1].hand[0];
  expect(applyAction(state, 1, { type: 'NORMAL_SUMMON', instanceId: defenderId, ...defenderOpts }).ok).toBe(true);
  monsterOf(state, 0, attackerId).baseAtk = atk;
  monsterOf(state, 1, defenderId).baseDef = def;
  advanceUntil(state, 3, 'battle');
  return { state, attackerId, defenderId };
}

describe('Attacking a monster in defense position (rulebook)', () => {
  it('destroys the defender with no VP loss when ATK > Vida', async () => {
    const { state, attackerId, defenderId } = await battleSetup({ atk: 6, def: 3, defenderOpts: { position: 'defense' } });
    const vp = [state.players[0].vp, state.players[1].vp];
    const result = applyAction(state, 0, { type: 'DECLARE_ATTACK', attackerInstanceId: attackerId, targetInstanceId: defenderId });
    expect(result.destroyedDefender).toBe(true);
    expect(monsterOf(state, 1, defenderId)).toBeUndefined();
    expect([state.players[0].vp, state.players[1].vp]).toEqual(vp);
  });

  it('destroys nothing and deals no damage when ATK = Vida', async () => {
    const { state, attackerId, defenderId } = await battleSetup({ atk: 4, def: 4, defenderOpts: { position: 'defense' } });
    const vp = [state.players[0].vp, state.players[1].vp];
    const result = applyAction(state, 0, { type: 'DECLARE_ATTACK', attackerInstanceId: attackerId, targetInstanceId: defenderId });
    expect(result.destroyedDefender).toBe(false);
    expect(result.destroyedAttacker).toBe(false);
    expect([state.players[0].vp, state.players[1].vp]).toEqual(vp);
  });

  it('costs the attacker Vida - ATK in VP and destroys nothing when ATK < Vida', async () => {
    const { state, attackerId, defenderId } = await battleSetup({ atk: 2, def: 7, defenderOpts: { position: 'defense' } });
    const before = state.players[0].vp;
    const result = applyAction(state, 0, { type: 'DECLARE_ATTACK', attackerInstanceId: attackerId, targetInstanceId: defenderId });
    expect(result.destroyedDefender).toBe(false);
    expect(result.destroyedAttacker).toBe(false);
    expect(state.players[0].vp).toBe(before - 5);
    expect(state.players[1].vp).toBe(80);
  });

  it('turns a face-down defender face-up when it is attacked', async () => {
    const { state, attackerId, defenderId } = await battleSetup({ atk: 1, def: 9, defenderOpts: { position: 'defense', faceDown: true } });
    expect(monsterOf(state, 1, defenderId).faceDown).toBe(true);
    applyAction(state, 0, { type: 'DECLARE_ATTACK', attackerInstanceId: attackerId, targetInstanceId: defenderId });
    expect(monsterOf(state, 1, defenderId).faceDown).toBe(false);
  });
});

describe('CHANGE_POSITION', () => {
  it('switches attack <-> defense in a main phase, once per turn, but not on the summon turn', async () => {
    const state = await makeMatch();
    const id = state.players[0].hand[0];
    advanceUntil(state, 1, 'main1');
    applyAction(state, 0, { type: 'NORMAL_SUMMON', instanceId: id, position: 'attack' });
    const tooSoon = applyAction(state, 0, { type: 'CHANGE_POSITION', instanceId: id, position: 'defense' });
    expect(tooSoon.reason).toBe('summoned-this-turn');

    advanceUntil(state, 3, 'main1');
    expect(applyAction(state, 0, { type: 'CHANGE_POSITION', instanceId: id, position: 'defense' }).ok).toBe(true);
    expect(monsterOf(state, 0, id).position).toBe('defense');
    expect(applyAction(state, 0, { type: 'CHANGE_POSITION', instanceId: id, position: 'attack' }).reason).toBe('already-changed-position');
  });

  it('rejects the same position, and any change outside a main phase', async () => {
    const state = await makeMatch();
    const id = state.players[0].hand[0];
    applyAction(state, 0, { type: 'NORMAL_SUMMON', instanceId: id, position: 'attack' });
    advanceUntil(state, 3, 'main1');
    expect(applyAction(state, 0, { type: 'CHANGE_POSITION', instanceId: id, position: 'attack' }).reason).toBe('same-position');
    advanceUntil(state, 3, 'battle');
    expect(applyAction(state, 0, { type: 'CHANGE_POSITION', instanceId: id, position: 'defense' }).reason).toBe('not-main-phase');
  });

  it('flips a face-down monster face-up in the position you choose', async () => {
    const state = await makeMatch();
    const id = state.players[0].hand[0];
    applyAction(state, 0, { type: 'NORMAL_SUMMON', instanceId: id, position: 'defense', faceDown: true });
    advanceUntil(state, 3, 'main1');
    const result = applyAction(state, 0, { type: 'CHANGE_POSITION', instanceId: id, position: 'attack' });
    expect(result.ok).toBe(true);
    expect(result.flipped).toBe(true);
    expect(monsterOf(state, 0, id)).toMatchObject({ faceDown: false, position: 'attack' });
  });
});
