// Both features here share one shape: the server refuses to guess on the player's behalf and
// instead returns { ok: false, reason: 'choose-target', options } for the client to resolve —
// Equipo cards (always need a monster picked) and search effects (more than one legal match).
const { connectDB, disconnectDB } = require('../../mongo/connection');
const { Card } = require('../../data/Schema/card');
const { Effect } = require('../../data/Schema/effect');
const { Deck } = require('../../data/Schema/deck');
const { User } = require('../../data/Schema/user');
const cards = require('../../data/seed/cards_final.json');
const effects = require('../../data/seed/effects_final.json');
const { createMatch, applyAction } = require('../../game/engine');
const { placeMonster } = require('../../game/zones');
const { passChain } = require('./chainHelpers');

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

// Player A's hand is exactly the named cards (x1 each); B gets an unrelated small deck.
async function makeMatch(namesA, namesB = ['Kraken']) {
  const docs = await Card.find({ name: { $in: [...new Set([...namesA, ...namesB])] } }).lean();
  const byName = new Map(docs.map((c) => [c.name, c]));
  const mk = async (tag, names) => {
    const user = await User.create({ userName: `Ic${tag}${Date.now()}`, email: `ic${tag}${Date.now()}@example.com`, password: 'x' });
    const deck = await Deck.create({ deckTitle: tag, owner: user._id, cards: names.map((n) => ({ card: byName.get(n)._id, amount: 1 })), fusionCards: [] });
    return { user, deck: await Deck.findById(deck._id).populate('cards.card').populate('fusionCards.card') };
  };
  const a = await mk('A', namesA);
  const b = await mk('B', namesB);
  const state = await createMatch({
    matchId: `ic-${Date.now()}-${Math.random()}`,
    playerA: a.user._id.toString(),
    deckA: a.deck,
    playerB: b.user._id.toString(),
    deckB: b.deck,
    vsBot: false,
  });
  const inHand = (name) => state.players[0].hand.find((id) => id.split(':')[1] === byName.get(name)._id.toString());
  return { state, inHand, byName };
}

function toMain1(state) {
  while (state.phase !== 'main1') applyAction(state, state.turnPlayer, { type: 'ADVANCE_PHASE' });
}

const monsterOf = (state, p, id) => state.players[p].field.monsters.find((m) => m && m.instanceId === id);

describe('Equipo cards must name a target to activate', () => {
  it('asks the player to pick a monster instead of activating "plain"', async () => {
    const { state, inHand } = await makeMatch(['Armadura de Insecto', 'Avispa gigante', 'Avispa Mutante']);
    toMain1(state);
    state.players[0].pixelcoins = 6;
    const insect = inHand('Avispa gigante');
    const insect2 = inHand('Avispa Mutante');
    placeMonster(state, insect, 0, { position: 'attack' });
    placeMonster(state, insect2, 0, { position: 'attack' });

    const res = applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: inHand('Armadura de Insecto') });
    expect(res).toMatchObject({ ok: false, reason: 'choose-target' });
    expect(res.options.map((o) => o.instanceId).sort()).toEqual([insect, insect2].sort());
    // Nothing was spent or placed while waiting on the pick.
    expect(state.players[0].pixelcoins).toBe(6);
    expect(state.players[0].field.support.every((s) => !s)).toBe(true);
  });

  it('equips the only legal monster without asking (nothing to choose between)', async () => {
    const { state, inHand } = await makeMatch(['Armadura de Insecto', 'Avispa gigante']);
    toMain1(state);
    state.players[0].pixelcoins = 6;
    const insect = inHand('Avispa gigante');
    placeMonster(state, insect, 0, { position: 'attack' });
    const armadura = inHand('Armadura de Insecto');
    expect(applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: armadura })).toMatchObject({ ok: true });
    expect(state.players[0].field.support.find((s) => s && s.instanceId === armadura)).toMatchObject({ equippedTo: insect });
  });

  it('rejects a target that fails the restriction on the card', async () => {
    const { state, inHand } = await makeMatch(['Armadura de Insecto', 'Slime']);
    toMain1(state);
    state.players[0].pixelcoins = 6;
    const nonInsect = inHand('Slime'); // Demonio, not Insecto
    placeMonster(state, nonInsect, 0, { position: 'attack' });
    const res = applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: inHand('Armadura de Insecto'), targets: [nonInsect] });
    expect(res).toMatchObject({ ok: false, reason: 'invalid-equip-target' });
  });

  it('equips the chosen Insecto and buffs only it', async () => {
    const { state, inHand } = await makeMatch(['Armadura de Insecto', 'Avispa gigante', 'Slime']);
    toMain1(state);
    state.players[0].pixelcoins = 6;
    const insect = inHand('Avispa gigante');
    const other = inHand('Slime');
    placeMonster(state, insect, 0, { position: 'attack' });
    placeMonster(state, other, 0, { position: 'attack' });

    const res = applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: inHand('Armadura de Insecto'), targets: [insect] });
    expect(res.ok).toBe(true);
    expect(monsterOf(state, 0, insect).tempBuff.atk).toBe(3);
    expect(monsterOf(state, 0, other).tempBuff.atk).toBe(0);
  });

  it('refuses activation outright when nothing on the field is legal', async () => {
    const { state, inHand } = await makeMatch(['Armadura de Insecto', 'Slime']);
    toMain1(state);
    state.players[0].pixelcoins = 6;
    placeMonster(state, inHand('Slime'), 0, { position: 'attack' });
    expect(applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: inHand('Armadura de Insecto') })).toMatchObject({ ok: false, reason: 'no-legal-equip-target' });
  });

  it('sends the equip card to the graveyard when the equipped monster is destroyed', async () => {
    const { state, inHand } = await makeMatch(['Espíritu de batalla', 'Avispa gigante', 'Slime']);
    toMain1(state);
    state.players[0].pixelcoins = 6;
    const equipped = inHand('Avispa gigante');
    placeMonster(state, equipped, 0, { position: 'attack' });
    const equipId = inHand('Espíritu de batalla');
    const res = applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: equipId, targets: [equipped] });
    expect(res.ok).toBe(true);
    expect(state.players[0].field.support.some((s) => s && s.instanceId === equipId)).toBe(true);

    const { moveToZone } = require('../../game/zones');
    moveToZone(state, equipped, 'graveyard');
    expect(state.players[0].field.support.every((s) => !s)).toBe(true);
    expect(state.players[0].graveyard).toContain(equipId);
  });

  it('an Equipo with a restriction on args (side: opponent) can only be equipped to the rival', async () => {
    const { state, inHand } = await makeMatch(['Fuegos Fatuos', 'Slime'], ['Kraken']);
    toMain1(state);
    state.players[0].pixelcoins = 6;
    placeMonster(state, inHand('Slime'), 0, { position: 'attack' });
    const res = applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: inHand('Fuegos Fatuos') });
    // Own field has a monster but Fuegos Fatuos can only target the opponent's, and the opponent
    // (Kraken-only deck) has none on the field yet.
    expect(res).toMatchObject({ ok: false, reason: 'no-legal-equip-target' });
  });
});

describe('Search effects offer real choices instead of grabbing whichever card is first', () => {
  it('Enjambre de Avispas lists every "Avispa" in the deck and moves only the one picked', async () => {
    const { state, inHand } = await makeMatch(['Enjambre de Avispas', 'Kraken'], ['Kraken']);
    const wasps = ['Avispa gigante', 'Avispa Mutante', 'Avispa de Obsidiana'];
    const wasteDocs = await Card.find({ name: { $in: wasps } }).lean();
    wasteDocs.forEach((c, i) => state.players[0].deck.push(`0:${c._id}:w${i}`));
    toMain1(state);
    state.players[0].pixelcoins = 6;

    const res = applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: inHand('Enjambre de Avispas') });
    expect(res).toMatchObject({ ok: false, reason: 'choose-target' });
    expect(res.options).toHaveLength(3);
    expect(new Set(res.options.map((o) => o.name))).toEqual(new Set(wasps));
    // Nothing was spent while the choice is pending.
    expect(state.players[0].pixelcoins).toBe(6);

    // Not Avispa Mutante — its own "invócalo inmediatamente" would pull it right back out of hand,
    // which is correct but unrelated to what this test is checking.
    const chosen = res.options.find((o) => o.name !== 'Avispa Mutante').instanceId;
    const res2 = applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: inHand('Enjambre de Avispas'), targets: [chosen] });
    expect(res2.ok).toBe(true);
    passChain(state);
    expect(state.players[0].hand).toContain(chosen);
    expect(state.players[0].deck).not.toContain(chosen);
    expect(state.players[0].pixelcoins).toBe(4);
  });

  it('does not ask when there is only one legal match', async () => {
    const { state, inHand } = await makeMatch(['Enjambre de Avispas', 'Kraken'], ['Kraken']);
    const only = (await Card.findOne({ name: 'Avispa gigante' }).lean())._id;
    state.players[0].deck.push(`0:${only}:w0`);
    toMain1(state);
    state.players[0].pixelcoins = 6;
    const res = applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: inHand('Enjambre de Avispas') });
    expect(res.ok).toBe(true);
    passChain(state);
    expect(state.players[0].hand.some((id) => id.startsWith('0:' + only))).toBe(true);
  });
});
