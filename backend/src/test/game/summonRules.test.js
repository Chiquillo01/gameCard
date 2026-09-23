const { connectDB, disconnectDB } = require('../../mongo/connection');
const { Card } = require('../../data/Schema/card');
const { Effect } = require('../../data/Schema/effect');
const { Deck } = require('../../data/Schema/deck');
const { User } = require('../../data/Schema/user');
const cards = require('../../data/seed/cards_final.json');
const effects = require('../../data/seed/effects_final.json');
const { createMatch, applyAction, viewFor } = require('../../game/engine');
const { passChain } = require('./chainHelpers');
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

  it('refuses a monster whose method says "Solo puede ser invocado especial..."', async () => {
    const { state, inHand } = await makeMatch(['Lich', 'Kraken']);
    toMain1(state);
    const res = applyAction(state, 0, { type: 'NORMAL_SUMMON', instanceId: inHand('Lich'), position: 'attack' });
    expect(res).toMatchObject({ ok: false, reason: 'special-summon-only' });
  });

  it('lets a card whose method says "puedes / se puede" be Normal Summoned too (optional special summon)', async () => {
    const { state, inHand } = await makeMatch(['Avispa gigante', 'Pegaso', 'Kraken']);
    toMain1(state);
    expect(applyAction(state, 0, { type: 'NORMAL_SUMMON', instanceId: inHand('Avispa gigante'), position: 'attack' }).ok).toBe(true);
    state.players[0].normalSummonUsed = false;
    expect(applyAction(state, 0, { type: 'NORMAL_SUMMON', instanceId: inHand('Pegaso'), position: 'attack' }).ok).toBe(true);
  });

  it('also allows Normal Summon for a conditional special-summon trigger with no "solo" ("Si X, invocarlo especial")', async () => {
    // Avispa Mutante, the 4 baby dragons, Perro Esqueleto and Cofre Esqueleto all read this way:
    // an imperative ("invocarlo especial") or a trigger condition, never "solo puede/puedes/se".
    const { state, inHand } = await makeMatch(['Avispa Mutante', 'Inferno, el Dragón de Fuego', 'Perro Esqueleto', 'Kraken']);
    toMain1(state);
    ['Avispa Mutante', 'Inferno, el Dragón de Fuego', 'Perro Esqueleto'].forEach((name) => {
      state.players[0].normalSummonUsed = false;
      expect(applyAction(state, 0, { type: 'NORMAL_SUMMON', instanceId: inHand(name), position: 'attack' })).toMatchObject({ ok: true });
    });
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
    passChain(state);
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
    // Two Avispas are still in the deck, so the search waits on a pick instead of grabbing one.
    expect(state.pendingTriggerChoices).toHaveLength(1);
    // Not Avispa Mutante — its own "invócalo inmediatamente" would pull it right back out of hand,
    // which is correct but unrelated to what this test is checking.
    const picked = state.pendingTriggerChoices[0].options.find((o) => o.name !== 'Avispa Mutante').instanceId;
    expect(applyAction(state, 0, { type: 'RESOLVE_TRIGGER_CHOICE', targets: [picked] })).toMatchObject({ ok: true });
    // -1 summoned, +1 searched: one of the two Avispas left the deck.
    expect(state.players[0].hand.length).toBe(handBefore);
    expect(state.players[0].deck.length).toBe(1);
    const nidoFires = () => state.log.filter((l) => l.message.includes('NIDO_AVISPAS_FIRST_SUMMON')).length;
    expect(nidoFires()).toBe(1);

    // A second Avispa summoned later does not fire the Nido again. Whichever wasp is still in the
    // deck (the search above always avoided Avispa Mutante, so this is it) — pushed straight to
    // hand rather than searched, so it never triggers its own auto-special-summon.
    const secondWasp = state.players[0].deck.find((id) => getCard(id.split(':')[1]).name === 'Avispa Mutante');
    state.players[0].deck = state.players[0].deck.filter((id) => id !== secondWasp);
    state.players[0].hand.push(secondWasp);
    state.players[0].normalSummonUsed = false;
    expect(applyAction(state, 0, { type: 'NORMAL_SUMMON', instanceId: secondWasp, position: 'attack' }).ok).toBe(true);
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

describe('Effects rewritten to match the new descriptions', () => {
  const { placeMonster } = require('../../game/zones');
  const onField = (state, p, id) => state.players[p].field.monsters.find((m) => m && m.instanceId === id);
  const idOf = (state, p, name) => [...state.players[p].hand, ...state.players[p].deck].find((id) => getCard(id.split(':')[1]).name === name);

  it('Sacrificio memorable destroys one of your monsters as the cost and one of the rival\'s', async () => {
    const { state, inHand } = await makeMatch(['Sacrificio memorable', 'Slime', 'Kraken'], ['Esqueleto', 'Slime', 'Carnivora Come Hombres', 'Kraken', 'Arboleda', 'Nido de Avispas']);
    toMain1(state);
    state.players[0].pixelcoins = 6;
    const mine = inHand('Slime');
    placeMonster(state, mine, 0, { position: 'attack' });
    const theirs = state.players[1].hand[0];
    placeMonster(state, theirs, 1, { position: 'attack' });
    expect(applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: inHand('Sacrificio memorable') }).ok).toBe(true);
    passChain(state);
    expect(onField(state, 0, mine)).toBeUndefined();
    expect(onField(state, 1, theirs)).toBeUndefined();
    expect(state.players[0].graveyard).toContain(mine);
  });

  it('Sacrificio memorable cannot be played with no monster of yours to destroy', async () => {
    const { state, inHand } = await makeMatch(['Sacrificio memorable', 'Kraken']);
    toMain1(state);
    state.players[0].pixelcoins = 6;
    expect(applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: inHand('Sacrificio memorable') })).toMatchObject({ ok: false, reason: 'cannot-pay-cost' });
  });

  it('El Primer Ginete brings back 2 Dragones when it is destroyed', async () => {
    const { state, inHand } = await makeMatch(['El Primer Ginete', 'Dragón de Oscuridad Bebe', 'Dragón de Tierra Bebe', 'Kraken']);
    toMain1(state);
    const ginete = inHand('El Primer Ginete');
    placeMonster(state, ginete, 0, { position: 'attack' });
    ['Dragón de Oscuridad Bebe', 'Dragón de Tierra Bebe'].forEach((n) => {
      const id = inHand(n);
      state.players[0].hand = state.players[0].hand.filter((i) => i !== id);
      state.players[0].graveyard.push(id);
    });
    const { registry } = require('../../game/effects/actions');
    registry.destroy({ state, controllerIndex: 1, sourceInstanceId: 'x', effect: {} }, { side: 'opponent', zone: 'monster', count: 1 }, []);
    expect(state.players[0].graveyard).toContain(ginete);
    expect(state.players[0].hand.filter((id) => /Bebe/.test(getCard(id.split(':')[1]).name)).length).toBe(2);
  });

  it('Rey Demonio destroys a Demonio and grows +2/+2, and ignores the rival\'s destroy effects', async () => {
    const { state, inHand } = await makeMatch(['Rey Demonio', 'Slime', 'Kraken']);
    toMain1(state);
    const rey = inHand('Rey Demonio');
    placeMonster(state, rey, 0, { position: 'attack' });
    const slime = inHand('Slime'); // Demonio
    placeMonster(state, slime, 1, { position: 'attack' });
    const before = onField(state, 0, rey).baseAtk;
    expect(applyAction(state, 0, { type: 'ACTIVATE_EFFECT', effectId: 'REY_DEMONIO_DESTROY_DEMON', sourceInstanceId: rey }).ok).toBe(true);
    passChain(state);
    expect(onField(state, 1, slime)).toBeUndefined();
    expect(onField(state, 0, rey).baseAtk).toBe(before + 2);

    // The rival's destroy effect can't touch it.
    const { registry } = require('../../game/effects/actions');
    registry.destroy({ state, controllerIndex: 1, sourceInstanceId: 'x', effect: {} }, { side: 'opponent', zone: 'monster', count: 1 }, []);
    expect(onField(state, 0, rey)).toBeDefined();
  });

  it('Capitán Bandido takes a monster, turns it into a Ladrón and destroys the rest of that side', async () => {
    const { state, inHand } = await makeMatch(['Capitán Bandido', 'Kraken']);
    toMain1(state);
    const cap = inHand('Capitán Bandido');
    placeMonster(state, cap, 0, { position: 'attack' });
    const [a, b] = state.players[1].hand;
    placeMonster(state, a, 1, { position: 'attack' });
    placeMonster(state, b, 1, { position: 'attack' });
    expect(applyAction(state, 0, { type: 'ACTIVATE_EFFECT', effectId: 'CAPITAN_BANDIDO_STEAL', sourceInstanceId: cap }).ok).toBe(true);
    passChain(state);
    expect(state.players[1].field.monsters.some(Boolean)).toBe(false);
    const stolen = [a, b].map((id) => onField(state, 0, id)).find(Boolean);
    expect(stolen.breedOverride).toBe('Ladrón');
  });

  it('Xorn can search the graveyard as well as the deck', async () => {
    const { state, inHand } = await makeMatch(['Xorn', 'Kraken']);
    const { registry } = require('../../game/effects/actions');
    const cardDoc = await Card.findOne({ breed: 'Roca', category: 'monster' }).lean();
    const id = `0:${cardDoc._id}:gy`;
    state.players[0].graveyard.push(id);
    registry.addCardToHandFromDeck({ state, controllerIndex: 0, sourceInstanceId: inHand('Xorn') }, { count: 1, scope: ['deck', 'graveyard'], filter: { breed: 'Roca', category: 'monster' } });
    expect(state.players[0].hand).toContain(id);
  });
});
