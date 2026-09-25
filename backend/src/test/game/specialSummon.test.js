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
const { placeMonster, moveToZone } = require('../../game/zones');
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

  it('Lich: exiles 5 NoMuertos from the Campo and/or Cementerio together', async () => {
    const { state, inHand } = await makeMatch(['Lich', 'Kraken']);
    const skeleton = await Card.findOne({ name: 'Esqueleto' }).lean();
    const graveIds = ['g1', 'g2', 'g3'].map((s) => `0:${skeleton._id}:${s}`);
    const fieldIds = ['f1', 'f2'].map((s) => `0:${skeleton._id}:${s}`);
    graveIds.forEach((id) => state.players[0].graveyard.push(id));
    fieldIds.forEach((id) => placeMonster(state, id, 0, { position: 'attack' }));
    toMain1(state);

    const lich = inHand('Lich');
    expect(applyAction(state, 0, { type: 'SPECIAL_SUMMON', instanceId: lich })).toMatchObject({ ok: true });
    expect(monsterOf(state, 0, lich)).toBeDefined();
    [...graveIds, ...fieldIds].forEach((id) => expect(state.players[0].banished).toContain(id));
    expect(state.players[0].graveyard).toHaveLength(0);
  });

  it('Lich: refuses without 5 NoMuertos to exile', async () => {
    const { state, inHand } = await makeMatch(['Lich', 'Kraken']);
    const skeleton = await Card.findOne({ name: 'Esqueleto' }).lean();
    state.players[0].graveyard.push(`0:${skeleton._id}:g1`, `0:${skeleton._id}:g2`);
    toMain1(state);
    expect(applyAction(state, 0, { type: 'SPECIAL_SUMMON', instanceId: inHand('Lich') })).toMatchObject({ ok: false, reason: 'cannot-pay-special-summon-cost' });
  });

  it('Aboleth: only special-summonable the turn a water monster was destroyed, from hand or Cementerio', async () => {
    const { state, inHand } = await makeMatch(['Aboleth', 'Kraken']);
    const hipocampo = await Card.findOne({ name: 'HipoCampo' }).lean();
    const water1 = `0:${hipocampo._id}:w1`;
    const water2 = `0:${hipocampo._id}:w2`;
    placeMonster(state, water1, 0, { position: 'attack' });
    placeMonster(state, water2, 0, { position: 'attack' });
    toMain1(state);

    const aboleth = inHand('Aboleth');
    // No water monster destroyed yet this turn: the window is closed.
    expect(applyAction(state, 0, { type: 'SPECIAL_SUMMON', instanceId: aboleth })).toMatchObject({ ok: false, reason: 'special-summon-condition-not-met' });

    moveToZone(state, water1, 'graveyard');
    expect(applyAction(state, 0, { type: 'SPECIAL_SUMMON', instanceId: aboleth })).toMatchObject({ ok: true });
    expect(monsterOf(state, 0, aboleth)).toBeDefined();

    // Send Aboleth itself to the graveyard and special-summon it from there in the same window.
    moveToZone(state, aboleth, 'graveyard');
    moveToZone(state, water2, 'graveyard');
    expect(applyAction(state, 0, { type: 'SPECIAL_SUMMON', instanceId: aboleth })).toMatchObject({ ok: true });
    expect(monsterOf(state, 0, aboleth)).toBeDefined();
  });

  it('Avispa Mutante: a card-effect draw (Olla de la Usura) special-summons it the instant it reaches hand', async () => {
    const { state, inHand } = await makeMatch(['Olla de la Usura', 'Kraken']);
    const mutante = await Card.findOne({ name: 'Avispa Mutante' }).lean();
    const mutanteId = `0:${mutante._id}:m1`;
    // Olla draws 2: Mutante plus a filler card, so the draw doesn't empty the Mazo (a loss).
    state.players[0].deck.unshift(mutanteId, `0:${(await Card.findOne({ name: 'Kraken' }).lean())._id}:filler`);
    toMain1(state);
    state.players[0].pixelcoins = 6;

    expect(applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: inHand('Olla de la Usura') }).ok).toBe(true);
    passChain(state);
    // Rulebook: the player still picks which monster zone it lands in — the game waits on that.
    expect(viewFor(state, 0).pendingTriggerChoice).toMatchObject({ kind: 'slot', zone: 'monster', slots: [0, 1, 2, 3, 4], card: { instanceId: mutanteId } });
    expect(viewFor(state, 1).pendingTriggerChoice).toBeNull();
    expect(applyAction(state, 0, { type: 'ADVANCE_PHASE' })).toMatchObject({ ok: false, reason: 'trigger-choice-pending' });
    expect(applyAction(state, 0, { type: 'RESOLVE_TRIGGER_CHOICE', slot: 3 })).toMatchObject({ ok: true });
    expect(state.players[0].field.monsters[3]).toMatchObject({ instanceId: mutanteId });
    expect(state.players[0].hand).not.toContain(mutanteId);
    // It didn't use up the turn's own Normal Summon.
    expect(state.players[0].normalSummonUsed).toBe(false);
  });

  it('Avispa Mutante: an occupied zone is refused and the choice stays open', async () => {
    const { state } = await makeMatch(['Kraken']);
    toMain1(state);
    const mutante = await Card.findOne({ name: 'Avispa Mutante' }).lean();
    const kraken = await Card.findOne({ name: 'Kraken' }).lean();
    const mutanteId = `0:${mutante._id}:m1`;
    placeMonster(state, `0:${kraken._id}:blocker`, 0, { position: 'attack', slot: 1 });
    state.players[0].hand.push(mutanteId);
    const { fireHandTrigger } = require('../../game/summon');
    fireHandTrigger(state, 'addedToHand', mutanteId, 0);
    expect(applyAction(state, 0, { type: 'RESOLVE_TRIGGER_CHOICE', slot: 1 })).toMatchObject({ ok: false, reason: 'no-field-space' });
    expect(state.players[0].hand).toContain(mutanteId);
    expect(applyAction(state, 0, { type: 'RESOLVE_TRIGGER_CHOICE', slot: 4 })).toMatchObject({ ok: true });
    expect(state.players[0].field.monsters[4]).toMatchObject({ instanceId: mutanteId });
  });

  it('Avispa Mutante: with a single free zone there is nothing to ask, it lands there directly', async () => {
    const { state } = await makeMatch(['Kraken']);
    toMain1(state);
    const mutante = await Card.findOne({ name: 'Avispa Mutante' }).lean();
    const kraken = await Card.findOne({ name: 'Kraken' }).lean();
    const mutanteId = `0:${mutante._id}:m1`;
    [0, 1, 3, 4].forEach((slot) => placeMonster(state, `0:${kraken._id}:b${slot}`, 0, { position: 'attack', slot }));
    state.players[0].hand.push(mutanteId);
    const { fireHandTrigger } = require('../../game/summon');
    fireHandTrigger(state, 'addedToHand', mutanteId, 0);
    expect(state.pendingTriggerChoices || []).toHaveLength(0);
    expect(state.players[0].field.monsters[2]).toMatchObject({ instanceId: mutanteId });
  });

  it("Avispa Mutante: its trigger's own exceptPhase guard skips the turn's own draw phase", async () => {
    const { state } = await makeMatch(['Kraken']);
    const mutante = await Card.findOne({ name: 'Avispa Mutante' }).lean();
    const mutanteId = `0:${mutante._id}:m1`;
    state.players[0].hand.push(mutanteId);
    state.phase = 'draw';
    const { fireHandTrigger } = require('../../game/summon');
    fireHandTrigger(state, 'addedToHand', mutanteId, 0);
    expect(state.players[0].hand).toContain(mutanteId);
    expect(monsterOf(state, 0, mutanteId)).toBeUndefined();
  });
});
