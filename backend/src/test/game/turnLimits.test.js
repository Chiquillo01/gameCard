// "Una vez por turno" limits a card's own use of ITS effect, not every copy of that card name at
// once — two Vampiros should each get their own use, and a second copy of a support card (e.g.
// Enjambre de Avispas) should never be blocked by the first copy having already been played.
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
    const user = await User.create({ userName: `Tl${tag}${Date.now()}`, email: `tl${tag}${Date.now()}@example.com`, password: 'x' });
    const deck = await Deck.create({ deckTitle: tag, owner: user._id, cards: names.map((n) => ({ card: byName.get(n)._id, amount: 1 })), fusionCards: [] });
    return { user, deck: await Deck.findById(deck._id).populate('cards.card').populate('fusionCards.card') };
  };
  const a = await mk('A', namesA);
  const b = await mk('B', namesB);
  const state = await createMatch({
    matchId: `tl-${Date.now()}-${Math.random()}`,
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

describe('"Una vez por turno" is tracked per card copy, not per card name', () => {
  it('lets two Vampiros on the field each generate a pixel the same turn', async () => {
    const { state, byName } = await makeMatch(['Vampiro', 'Kraken']);
    const vampCard = byName.get('Vampiro');
    const v1 = `0:${vampCard._id}:v1`;
    const v2 = `0:${vampCard._id}:v2`;
    placeMonster(state, v1, 0, { position: 'attack' });
    placeMonster(state, v2, 0, { position: 'attack' });
    toMain1(state);

    const before = state.players[0].pixelcoins;
    expect(applyAction(state, 0, { type: 'ACTIVATE_EFFECT', effectId: 'VAMPIRO_GENERATE_PIXEL', sourceInstanceId: v1 })).toMatchObject({ ok: true });
    expect(applyAction(state, 0, { type: 'ACTIVATE_EFFECT', effectId: 'VAMPIRO_GENERATE_PIXEL', sourceInstanceId: v2 })).toMatchObject({ ok: true });
    expect(state.players[0].pixelcoins).toBe(before + 2);

    // But the SAME copy can't use it twice.
    expect(applyAction(state, 0, { type: 'ACTIVATE_EFFECT', effectId: 'VAMPIRO_GENERATE_PIXEL', sourceInstanceId: v1 })).toMatchObject({ ok: false, reason: 'once-per-turn' });
  });

  it('lets a second copy of Enjambre de Avispas be played after the first, in the same turn', async () => {
    const { state, inHand } = await makeMatch(['Enjambre de Avispas', 'Enjambre de Avispas', 'Kraken']);
    toMain1(state);
    state.players[0].pixelcoins = 6;
    const [first, second] = state.players[0].hand.filter((id) => id.split(':')[1] === inHand('Enjambre de Avispas').split(':')[1]);
    expect(applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: first })).toMatchObject({ ok: true });
    expect(applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: second })).toMatchObject({ ok: true });
    expect(state.players[0].pixelcoins).toBe(6 - 4);
  });
});
