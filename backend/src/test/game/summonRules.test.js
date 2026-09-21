const { connectDB, disconnectDB } = require('../../mongo/connection');
const { Card } = require('../../data/Schema/card');
const { Effect } = require('../../data/Schema/effect');
const { Deck } = require('../../data/Schema/deck');
const { User } = require('../../data/Schema/user');
const cards = require('../../data/seed/cards_final.json');
const effects = require('../../data/seed/effects_final.json');
const { createMatch, applyAction, viewFor } = require('../../game/engine');
const { getCard } = require('../../game/cardIndex');

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

// Player A's hand is exactly the named cards (x1 each); B has an unrelated small deck.
async function makeMatch(names) {
  const docs = await Card.find({ name: { $in: names } }).lean();
  const byName = new Map(docs.map((c) => [c.name, c]));
  const mk = async (tag, list) => {
    const user = await User.create({ userName: `Sr${tag}${Date.now()}`, email: `sr${tag}${Date.now()}@example.com`, password: 'x' });
    const deck = await Deck.create({ deckTitle: tag, owner: user._id, cards: list.map((c) => ({ card: c._id, amount: 1 })), fusionCards: [] });
    return { user, deck: await Deck.findById(deck._id).populate('cards.card').populate('fusionCards.card') };
  };
  const a = await mk('A', names.map((n) => byName.get(n)));
  const b = await mk('B', docs);
  const state = await createMatch({
    matchId: `sr-${Date.now()}-${Math.random()}`,
    playerA: a.user._id.toString(),
    deckA: a.deck,
    playerB: b.user._id.toString(),
    deckB: b.deck,
    vsBot: false,
  });
  const inHand = (name) => state.players[0].hand.find((id) => id.split(':')[1] === byName.get(name)._id.toString());
  return { state, inHand };
}

function toMain1(state) {
  while (state.phase !== 'main1') applyAction(state, state.turnPlayer, { type: 'ADVANCE_PHASE' });
}

describe('Normal Summon and the invocation method', () => {
  it('refuses a monster that "cannot be summoned"', async () => {
    const { state, inHand } = await makeMatch(['Kraken', 'Rey Demonio']);
    toMain1(state);
    const res = applyAction(state, 0, { type: 'NORMAL_SUMMON', instanceId: inHand('Kraken'), position: 'attack' });
    expect(res).toMatchObject({ ok: false, reason: 'cannot-be-summoned' });
    expect(state.players[0].hand).toContain(inHand('Kraken'));
  });

  it('refuses a monster that needs a special summon requirement', async () => {
    const { state, inHand } = await makeMatch(['Inferno, el Dragón de Fuego', 'Kraken']);
    toMain1(state);
    const res = applyAction(state, 0, { type: 'NORMAL_SUMMON', instanceId: inHand('Inferno, el Dragón de Fuego'), position: 'attack' });
    expect(res).toMatchObject({ ok: false, reason: 'special-summon-only' });
  });

  it('lets a card whose method says "puedes / se puede" be Normal Summoned too (optional special summon)', async () => {
    const { state, inHand } = await makeMatch(['Avispa gigante', 'Pegaso', 'Kraken']);
    toMain1(state);
    expect(applyAction(state, 0, { type: 'NORMAL_SUMMON', instanceId: inHand('Avispa gigante'), position: 'attack' }).ok).toBe(true);
    state.players[0].normalSummonUsed = false;
    expect(applyAction(state, 0, { type: 'NORMAL_SUMMON', instanceId: inHand('Pegaso'), position: 'attack' }).ok).toBe(true);
  });

  it('lets a monster with no invocation method be Normal Summoned', async () => {
    const { state, inHand } = await makeMatch(['Slime', 'Kraken']);
    toMain1(state);
    expect(applyAction(state, 0, { type: 'NORMAL_SUMMON', instanceId: inHand('Slime'), position: 'attack' }).ok).toBe(true);
  });

  it('tells the client which hand monsters can be Normal Summoned', async () => {
    const { state, inHand } = await makeMatch(['Slime', 'Kraken']);
    const hand = viewFor(state, 0).players[0].hand;
    expect(hand.find((c) => c.instanceId === inHand('Kraken'))).toMatchObject({ normalSummonable: false, cannotBeSummoned: true });
    expect(hand.find((c) => c.instanceId === inHand('Slime'))).toMatchObject({ normalSummonable: true });
  });
});

describe('Setting support cards face-down', () => {
  it('lets a Normal support be set, then activated later from the field', async () => {
    const { state, inHand } = await makeMatch(['Chispa', 'Kraken']);
    toMain1(state);
    state.players[0].pixelcoins = 6;
    const id = inHand('Chispa');
    expect(applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: id, setFaceDown: true }).ok).toBe(true);
    const slot = state.players[0].field.support.find((s) => s && s.instanceId === id);
    expect(slot.faceDown).toBe(true);

    const res = applyAction(state, 0, { type: 'ACTIVATE_SET_SUPPORT', instanceId: id });
    expect(res.ok).toBe(true);
    expect(state.players[0].field.support.some((s) => s && s.instanceId === id)).toBe(false);
    expect(state.players[0].graveyard).toContain(id);
  });

  it('keeps a set Continuous support in its zone, face-up, once activated', async () => {
    const { state, inHand } = await makeMatch(['Nido de Avispas', 'Kraken']);
    toMain1(state);
    state.players[0].pixelcoins = 6;
    const id = inHand('Nido de Avispas');
    applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: id, setFaceDown: true });
    const r = applyAction(state, 0, { type: 'ACTIVATE_SET_SUPPORT', instanceId: id });
    expect(r).toMatchObject({ ok: true });
    const slot = state.players[0].field.support.find((s) => s && s.instanceId === id);
    expect(slot).toBeDefined();
    expect(slot.faceDown).toBe(false);
  });

  it('cannot set a Territorio', async () => {
    const { state } = await makeMatch(['Kraken']);
    const field = (await Card.findOne({ category: 'support', subtype: 'field' }).lean());
    if (!field) return;
    const id = `0:${field._id}:t`;
    state.players[0].hand.push(id);
    toMain1(state);
    expect(applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: id, setFaceDown: true })).toMatchObject({ ok: false, reason: 'cannot-set-territory' });
  });
});

describe('Nido de Avispas (first "Avispa" summoned while it is on the field)', () => {
  async function nidoMatch() {
    const ctx = await makeMatch(['Nido de Avispas', 'Avispa gigante', 'Avispa Mutante', 'Avispa de Obsidiana', 'Kraken']);
    const { state, inHand } = ctx;
    // Two Avispas go back to the deck so there is something to search for.
    ['Avispa Mutante', 'Avispa de Obsidiana'].forEach((name) => {
      const id = inHand(name);
      state.players[0].hand = state.players[0].hand.filter((i) => i !== id);
      state.players[0].deck.push(id);
    });
    toMain1(state);
    state.players[0].pixelcoins = 6;
    expect(applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: inHand('Nido de Avispas') }).ok).toBe(true);
    return ctx;
  }

  it('adds an Avispa from the deck to the hand the first time one is summoned, and only that once', async () => {
    const { state, inHand } = await nidoMatch();
    const handBefore = state.players[0].hand.length;
    expect(applyAction(state, 0, { type: 'NORMAL_SUMMON', instanceId: inHand('Avispa gigante'), position: 'defense' }).ok).toBe(true);
    // -1 summoned, +1 searched: one of the two Avispas left the deck.
    expect(state.players[0].hand.length).toBe(handBefore);
    expect(state.players[0].deck.length).toBe(1);
    const nidoFires = () => state.log.filter((l) => l.message.includes('NIDO_AVISPAS_FIRST_SUMMON')).length;
    expect(nidoFires()).toBe(1);

    // A second Avispa summoned later does not fire the Nido again.
    const obsidiana = state.players[0].deck.find((id) => getCard(id.split(':')[1]).name === 'Avispa de Obsidiana');
    state.players[0].deck = state.players[0].deck.filter((id) => id !== obsidiana);
    state.players[0].hand.push(obsidiana);
    state.players[0].normalSummonUsed = false;
    expect(applyAction(state, 0, { type: 'NORMAL_SUMMON', instanceId: obsidiana, position: 'attack' }).ok).toBe(true);
    expect(nidoFires()).toBe(1);
  });

  it('does not fire when the Nido is not on the field', async () => {
    const ctx = await makeMatch(['Nido de Avispas', 'Avispa gigante', 'Avispa Mutante', 'Kraken']);
    const { state, inHand } = ctx;
    const id = inHand('Avispa Mutante');
    state.players[0].hand = state.players[0].hand.filter((i) => i !== id);
    state.players[0].deck.push(id);
    toMain1(state);
    const handBefore = state.players[0].hand.length;
    applyAction(state, 0, { type: 'NORMAL_SUMMON', instanceId: inHand('Avispa gigante'), position: 'attack' });
    expect(state.players[0].hand.length).toBe(handBefore - 1);
  });
});

describe('Effect values follow the card text', () => {
  const monsterOf = (state, playerIndex, instanceId) => state.players[playerIndex].field.monsters.find((m) => m && m.instanceId === instanceId);

  it('Arboleda gives every Planta on the field (both sides) +1 Atk/Vida and nothing else', async () => {
    const { state, inHand } = await makeMatch(['Arboleda', 'Carnivora Come Hombres', 'Slime', 'Kraken']);
    toMain1(state);
    state.players[0].pixelcoins = 6;
    const planta = inHand('Carnivora Come Hombres');
    const slime = inHand('Slime');
    applyAction(state, 0, { type: 'NORMAL_SUMMON', instanceId: planta, position: 'attack' });
    state.players[0].normalSummonUsed = false;
    applyAction(state, 0, { type: 'NORMAL_SUMMON', instanceId: slime, position: 'attack' });
    expect(applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: inHand('Arboleda') }).ok).toBe(true);

    expect(monsterOf(state, 0, planta).tempBuff).toEqual({ atk: 1, def: 1 });
    expect(monsterOf(state, 0, slime).tempBuff).toEqual({ atk: 0, def: 0 });
  });

  it('Ciempiés Gigante gets +1 Atk for each other Insecto on the field, and Avispa gigante pays 1 pixel as its material', async () => {
    const { state, inHand } = await makeMatch(['Ciempiés Gigante', 'Avispa gigante', 'Avispa Mutante', 'Avispa de Obsidiana', 'Kraken']);
    toMain1(state);
    state.players[0].pixelcoins = 0;
    const fusion = inHand('Ciempiés Gigante');
    const obsidiana = inHand('Avispa de Obsidiana');
    expect(applyAction(state, 0, { type: 'COMPILE_SUMMON', instanceId: fusion, materialInstanceIds: [inHand('Avispa gigante'), inHand('Avispa Mutante')] }).ok).toBe(true);
    expect(state.players[0].pixelcoins).toBe(1);
    expect(monsterOf(state, 0, fusion).tempBuff.atk).toBe(0);

    applyAction(state, 0, { type: 'NORMAL_SUMMON', instanceId: obsidiana, position: 'attack' });
    expect(monsterOf(state, 0, fusion).tempBuff.atk).toBe(1);
  });
});

describe('Phase-timed effects', () => {
  it('Bálor hits the rival for 3 only in the standby phase, once per turn', async () => {
    const { state, inHand } = await makeMatch(['Bálor', 'Kraken']);
    const { placeMonster } = require('../../game/zones');
    placeMonster(state, inHand('Bálor'), 0, { position: 'attack' });
    while (state.turnNumber === 1 && state.phase !== 'end') applyAction(state, 0, { type: 'ADVANCE_PHASE' });
    expect(state.players[1].vp).toBe(77);
  });

});
