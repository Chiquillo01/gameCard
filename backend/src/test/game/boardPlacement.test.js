// Rulebook: the player picks where on the board a card lands, not the engine — every summon path
// (Normal, Special, Compilación) and every support placement (face-up or set face-down) accepts an
// optional 0-based `slot`; omitting it keeps the old first-empty-slot behavior other automatic
// placements (bot play, tokens, triggered summons) still rely on.
const { connectDB, disconnectDB } = require('../../mongo/connection');
const { Card } = require('../../data/Schema/card');
const { Effect } = require('../../data/Schema/effect');
const { Deck } = require('../../data/Schema/deck');
const { User } = require('../../data/Schema/user');
const cards = require('../../data/seed/cards_final.json');
const effects = require('../../data/seed/effects_final.json');
const { createMatch, applyAction } = require('../../game/engine');
const { placeMonster } = require('../../game/zones');

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

async function makeMatch(namesA, namesB = ['Kraken']) {
  const docs = await Card.find({ name: { $in: [...new Set([...namesA, ...namesB])] } }).lean();
  const byName = new Map(docs.map((c) => [c.name, c]));
  const mk = async (tag, names) => {
    const user = await User.create({ userName: `Bp${tag}${Date.now()}`, email: `bp${tag}${Date.now()}@example.com`, password: 'x' });
    const deck = await Deck.create({ deckTitle: tag, owner: user._id, cards: names.map((n) => ({ card: byName.get(n)._id, amount: 1 })), fusionCards: [] });
    return { user, deck: await Deck.findById(deck._id).populate('cards.card').populate('fusionCards.card') };
  };
  const a = await mk('A', namesA);
  const b = await mk('B', namesB);
  const state = await createMatch({
    matchId: `bp-${Date.now()}-${Math.random()}`,
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

describe('Board placement is the player\'s own choice', () => {
  it('Normal Summon lands in the exact monster slot the player picked', async () => {
    const { state, inHand } = await makeMatch(['Slime', 'Kraken']);
    toMain1(state);
    const slime = inHand('Slime');
    const res = applyAction(state, 0, { type: 'NORMAL_SUMMON', instanceId: slime, position: 'attack', slot: 3 });
    expect(res).toMatchObject({ ok: true });
    expect(state.players[0].field.monsters[3]).toMatchObject({ instanceId: slime });
    expect(state.players[0].field.monsters.filter(Boolean)).toHaveLength(1);
  });

  it('refuses a monster slot that is already occupied', async () => {
    const { state, inHand } = await makeMatch(['Slime', 'Fire Giant', 'Kraken']);
    toMain1(state);
    placeMonster(state, `0:${(await Card.findOne({ name: 'Kraken' }).lean())._id}:blocker`, 0, { position: 'attack', slot: 2 });
    const slime = inHand('Slime');
    const res = applyAction(state, 0, { type: 'NORMAL_SUMMON', instanceId: slime, position: 'attack', slot: 2 });
    expect(res).toMatchObject({ ok: false, reason: 'no-field-space' });
    expect(state.players[0].hand).toContain(slime); // never moved
  });

  it('falls back to the first empty slot when no slot is given (unchanged behavior)', async () => {
    const { state, inHand } = await makeMatch(['Slime', 'Kraken']);
    toMain1(state);
    const slime = inHand('Slime');
    const res = applyAction(state, 0, { type: 'NORMAL_SUMMON', instanceId: slime, position: 'attack' });
    expect(res).toMatchObject({ ok: true });
    expect(state.players[0].field.monsters[0]).toMatchObject({ instanceId: slime });
  });

  it('Apoyo Continuo lands in the exact support slot the player picked, face-up or set face-down', async () => {
    const { state, inHand } = await makeMatch(['Nido de Avispas', 'Chispa', 'Kraken']);
    toMain1(state);
    state.players[0].pixelcoins = 6;
    const nido = inHand('Nido de Avispas');
    const res = applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: nido, slot: 2 });
    expect(res).toMatchObject({ ok: true });
    expect(state.players[0].field.support[2]).toMatchObject({ instanceId: nido });

    const chispa = inHand('Chispa');
    const res2 = applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: chispa, setFaceDown: true, slot: 0 });
    expect(res2).toMatchObject({ ok: true });
    expect(state.players[0].field.support[0]).toMatchObject({ instanceId: chispa, faceDown: true });
  });

  it('refuses a support slot that is already occupied', async () => {
    const { state, inHand } = await makeMatch(['Nido de Avispas', 'Chispa', 'Kraken']);
    toMain1(state);
    state.players[0].pixelcoins = 6;
    const nido = inHand('Nido de Avispas');
    applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: nido, slot: 1 });
    const chispa = inHand('Chispa');
    const res = applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: chispa, setFaceDown: true, slot: 1 });
    expect(res).toMatchObject({ ok: false, reason: 'no-field-space' });
    expect(state.players[0].hand).toContain(chispa);
  });

  it('Compilación lands in the slot the player picked, including a slot a field material just freed', async () => {
    const { state, inHand } = await makeMatch(['Ciempiés Gigante', 'Avispa Mutante', 'Kraken']);
    toMain1(state);
    const gigante = inHand('Ciempiés Gigante');
    const mat1Card = await Card.findOne({ name: 'Avispa gigante' }).lean();
    const mat1 = `0:${mat1Card._id}:m1`;
    placeMonster(state, mat1, 0, { position: 'attack', slot: 4 }); // the only slot this Compilación will use is the one freed by mat1
    const mat2 = inHand('Avispa Mutante');

    const res = applyAction(state, 0, {
      type: 'COMPILE_SUMMON',
      instanceId: gigante,
      materialInstanceIds: [mat1, mat2],
      slot: 4,
    });
    expect(res).toMatchObject({ ok: true });
    expect(state.players[0].field.monsters[4]).toMatchObject({ instanceId: gigante });
  });
});
