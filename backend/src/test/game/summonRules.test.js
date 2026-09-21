const { connectDB, disconnectDB } = require('../../mongo/connection');
const { Card } = require('../../data/Schema/card');
const { Effect } = require('../../data/Schema/effect');
const { Deck } = require('../../data/Schema/deck');
const { User } = require('../../data/Schema/user');
const cards = require('../../data/seed/cards_final.json');
const effects = require('../../data/seed/effects_final.json');
const { createMatch, applyAction, viewFor } = require('../../game/engine');

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
    const { state, inHand } = await makeMatch(['Pegaso', 'Kraken']);
    toMain1(state);
    const res = applyAction(state, 0, { type: 'NORMAL_SUMMON', instanceId: inHand('Pegaso'), position: 'attack' });
    expect(res).toMatchObject({ ok: false, reason: 'special-summon-only' });
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
