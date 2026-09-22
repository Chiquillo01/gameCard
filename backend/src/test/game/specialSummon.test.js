// Rulebook, "Método de invocación": a card whose text describes a special-summon condition/cost
// can be brought out that way too — SPECIAL_SUMMON, a separate action from NORMAL_SUMMON, and one
// that doesn't use up the turn's Normal Summon.
const { connectDB, disconnectDB } = require('../../mongo/connection');
const { Card } = require('../../data/Schema/card');
const { Effect } = require('../../data/Schema/effect');
const { Deck } = require('../../data/Schema/deck');
const { User } = require('../../data/Schema/user');
const cards = require('../../data/seed/cards_final.json');
const effects = require('../../data/seed/effects_final.json');
const { createMatch, applyAction, viewFor } = require('../../game/engine');
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
    const user = await User.create({ userName: `Ss${tag}${Date.now()}`, email: `ss${tag}${Date.now()}@example.com`, password: 'x' });
    const deck = await Deck.create({ deckTitle: tag, owner: user._id, cards: names.map((n) => ({ card: byName.get(n)._id, amount: 1 })), fusionCards: [] });
    return { user, deck: await Deck.findById(deck._id).populate('cards.card').populate('fusionCards.card') };
  };
  const a = await mk('A', namesA);
  const b = await mk('B', namesB);
  const state = await createMatch({
    matchId: `ss-${Date.now()}-${Math.random()}`,
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

describe('SPECIAL_SUMMON', () => {
  it("Avispa gigante: discarding an Insecto special-summons it, and doesn't use up the Normal Summon", async () => {
    const { state, inHand } = await makeMatch(['Avispa gigante', 'Avispa Mutante', 'Slime', 'Kraken']);
    toMain1(state);
    const avispa = inHand('Avispa gigante');
    const insect = inHand('Avispa Mutante');
    const other = inHand('Slime');

    // Still shows up as available to Normal Summon (it's optional, not exclusive).
    expect(viewFor(state, 0).players[0].hand.find((c) => c.instanceId === avispa)).toMatchObject({ normalSummonable: true, specialSummonAvailable: true });

    const res = applyAction(state, 0, { type: 'SPECIAL_SUMMON', instanceId: avispa });
    expect(res.ok).toBe(true);
    expect(monsterOf(state, 0, avispa)).toBeDefined();
    expect(state.players[0].graveyard).toContain(insect);
    expect(state.players[0].hand).toContain(other);

    // The Normal Summon for the turn is still free.
    expect(state.players[0].normalSummonUsed).toBe(false);
    expect(applyAction(state, 0, { type: 'NORMAL_SUMMON', instanceId: other, position: 'attack' })).toMatchObject({ ok: true });
  });

  it('refuses the special summon with no Insecto to discard', async () => {
    const { state, inHand } = await makeMatch(['Avispa gigante', 'Kraken']);
    toMain1(state);
    expect(applyAction(state, 0, { type: 'SPECIAL_SUMMON', instanceId: inHand('Avispa gigante') })).toMatchObject({ ok: false, reason: 'cannot-pay-special-summon-cost' });
  });

  it('Pegaso: needs a Hada on the field, not a cost', async () => {
    const { state, inHand } = await makeMatch(['Pegaso', 'Slime', 'Kraken']);
    toMain1(state);
    const pegaso = inHand('Pegaso');
    expect(applyAction(state, 0, { type: 'SPECIAL_SUMMON', instanceId: pegaso })).toMatchObject({ ok: false, reason: 'special-summon-condition-not-met' });

    const { getCard } = require('../../game/cardIndex');
    const hadaCard = await Card.findOne({ breed: 'Hada' }).lean();
    const hadaId = `0:${hadaCard._id}:h`;
    placeMonster(state, hadaId, 0, { position: 'attack' });
    expect(applyAction(state, 0, { type: 'SPECIAL_SUMMON', instanceId: pegaso })).toMatchObject({ ok: true });
    expect(monsterOf(state, 0, pegaso)).toBeDefined();
  });

  it('Vampiro: pays 5 VP instead of a card cost', async () => {
    const { state, inHand } = await makeMatch(['Vampiro', 'Kraken']);
    toMain1(state);
    const before = state.players[0].vp;
    expect(applyAction(state, 0, { type: 'SPECIAL_SUMMON', instanceId: inHand('Vampiro') })).toMatchObject({ ok: true });
    expect(state.players[0].vp).toBe(before - 5);
  });

  it('Fire Giant: sacrifices a Fuego monster', async () => {
    const { state, inHand } = await makeMatch(['Fire Giant', 'Slime', 'Kraken']);
    toMain1(state);
    const fireCard = await Card.findOne({ attribute: 'Fuego', category: 'monster' }).lean();
    const fireMon = `0:${fireCard._id}:f`;
    placeMonster(state, fireMon, 0, { position: 'attack' });
    const giant = inHand('Fire Giant');
    expect(applyAction(state, 0, { type: 'SPECIAL_SUMMON', instanceId: giant })).toMatchObject({ ok: true });
    expect(monsterOf(state, 0, fireMon)).toBeUndefined();
    expect(state.players[0].graveyard).toContain(fireMon);
    expect(monsterOf(state, 0, giant)).toBeDefined();
  });

  it('a monster with no special-summon method is refused', async () => {
    const { state, inHand } = await makeMatch(['Slime', 'Kraken']);
    toMain1(state);
    expect(applyAction(state, 0, { type: 'SPECIAL_SUMMON', instanceId: inHand('Slime') })).toMatchObject({ ok: false, reason: 'no-special-summon-method' });
  });
});
