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
  for (const c of cards) await Card.findOneAndUpdate({ number: c.number, name: c.name }, c, { upsert: true });
});

afterAll(async () => {
  await disconnectDB();
});

// Builds a 2-player match where each player's whole "deck" is just the given card names, each
// x2 — small on purpose so the named cards are guaranteed to land in the opening hand (hand
// size 6 > a 2-card deck), instead of relying on where a shuffle happens to put them.
async function makeMatchWithHands(namesA, namesB, { amountA = 2, amountB = 2 } = {}) {
  const wanted = [...new Set([...namesA, ...namesB])];
  const cardDocs = await Card.find({ name: { $in: wanted } }).lean();
  const byName = new Map(cardDocs.map((c) => [c.name, c]));

  const userA = await User.create({ userName: `RuleTestA${Date.now()}`, email: `ruletesta${Date.now()}@example.com`, password: 'x' });
  const userB = await User.create({ userName: `RuleTestB${Date.now()}`, email: `ruletestb${Date.now()}@example.com`, password: 'x' });

  const deckDocA = await Deck.create({
    deckTitle: 'A',
    owner: userA._id,
    cards: namesA.map((n) => ({ card: byName.get(n)._id, amount: amountA })),
    fusionCards: [],
  });
  const deckDocB = await Deck.create({
    deckTitle: 'B',
    owner: userB._id,
    cards: namesB.map((n) => ({ card: byName.get(n)._id, amount: amountB })),
    fusionCards: [],
  });

  const populatedA = await Deck.findById(deckDocA._id).populate('cards.card').populate('fusionCards.card');
  const populatedB = await Deck.findById(deckDocB._id).populate('cards.card').populate('fusionCards.card');

  return createMatch({
    matchId: `rule-${Date.now()}-${Math.random()}`,
    playerA: userA._id.toString(),
    deckA: populatedA,
    playerB: userB._id.toString(),
    deckB: populatedB,
    vsBot: false,
  });
}

// Advances phases using whichever player currently holds priority, until `state.phase` matches
// `targetPhase` on turn number `targetTurn` (or later) — robust to turn 1 having no Battle Phase.
function advanceUntil(state, targetTurn, targetPhase) {
  let guard = 0;
  while ((state.turnNumber < targetTurn || state.phase !== targetPhase) && guard < 80) {
    guard++;
    applyAction(state, state.turnPlayer, { type: 'ADVANCE_PHASE' });
  }
}

describe('Territorio upkeep', () => {
  it('does not charge anyone while only one player controls a Territorio', async () => {
    const state = await makeMatchWithHands(['Arboleda'], ['Arboleda']);
    const instanceId = state.players[0].hand.find((id) => id.startsWith('0:'));
    const before = state.players[0].pixelcoins;

    const result = applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId });
    expect(result.ok).toBe(true);
    expect(state.players[0].field.territory).not.toBeNull();

    applyAction(state, 0, { type: 'ADVANCE_PHASE' }); // main1 -> main2 (turn 1 has no battle phase)
    applyAction(state, 0, { type: 'ADVANCE_PHASE' }); // main2 -> end, triggers upkeep check

    // Only player 0 has a Territorio, so the "both players have one" upkeep never applies.
    expect(state.players[0].pixelcoins).toBe(before - 1); // -1 just for activation cost, not upkeep
    expect(state.players[1].pixelcoins).toBe(6);
  });

  it('charges 1 pixel to each player at end phase once both control a Territorio', async () => {
    // Player B needs to survive drawing on their own first turn (turn 2 — only the very first
    // turn of the whole match skips the draw), so their deck needs more than 6 cards deep.
    const state = await makeMatchWithHands(['Arboleda'], ['Océano', 'Templo del Dragón'], { amountB: 4 });
    const oceano = await Card.findOne({ name: 'Océano' }).lean();
    const instanceIdA = state.players[0].hand.find((id) => id.startsWith('0:'));
    const instanceIdB = state.players[1].hand.find((id) => id.split(':')[1] === oceano._id.toString());

    applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: instanceIdA });
    expect(state.players[0].field.territory).not.toBeNull();

    // Get to player 1's main phase to activate their own Territorio.
    advanceUntil(state, 2, 'main1');
    expect(state.turnPlayer).toBe(1);

    const r = applyAction(state, 1, { type: 'ACTIVATE_SUPPORT', instanceId: instanceIdB });
    expect(r.ok).toBe(true);
    expect(state.players[1].field.territory).not.toBeNull();

    const pA = state.players[0].pixelcoins;
    const pB = state.players[1].pixelcoins;

    advanceUntil(state, 2, 'end'); // both now have a Territorio active going into this end phase

    expect(state.players[0].pixelcoins).toBe(pA - 1);
    expect(state.players[1].pixelcoins).toBe(pB - 1);
  });

  it('replaces an existing Territorio (sends the old one to the graveyard) instead of blocking activation', async () => {
    const state = await makeMatchWithHands(['Arboleda', 'Océano'], []);

    // instanceId format is `${ownerIndex}:${cardId}:${n}` — resolve each hand card by matching
    // the middle segment against the real Card document's _id.
    const arboleda = await Card.findOne({ name: 'Arboleda' }).lean();
    const oceano = await Card.findOne({ name: 'Océano' }).lean();
    const findByCardId = (cardId) => state.players[0].hand.find((instanceId) => instanceId.split(':')[1] === cardId.toString());

    const firstId = findByCardId(arboleda._id);
    applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: firstId });
    const firstTerritoryInstance = state.players[0].field.territory.instanceId;

    const secondId = findByCardId(oceano._id);
    const result = applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: secondId });

    expect(result.ok).toBe(true);
    expect(state.players[0].field.territory.instanceId).not.toBe(firstTerritoryInstance);
    expect(state.players[0].graveyard).toContain(firstTerritoryInstance);
  });
});

describe('Apoyo Normal — segundo efecto desde el cementerio', () => {
  it('lets a card activate its graveyard-only effect once it is actually in the graveyard', async () => {
    const state = await makeMatchWithHands(['Enjambre de Avispas'], []);
    const card = await Card.findOne({ name: 'Enjambre de Avispas' }).lean();
    const instanceId = state.players[0].hand.find((id) => id.split(':')[1] === card._id.toString());

    // Rejected before the card has ever been in the graveyard.
    const tooEarly = applyAction(state, 0, { type: 'ACTIVATE_EFFECT', effectId: 'WASP_SWARM_GRAVE', sourceInstanceId: instanceId });
    expect(tooEarly.ok).toBe(false);
    expect(tooEarly.reason).toBe('not-in-graveyard');

    // Playing a Normal Apoyo resolves its primary effect and sends it straight to the graveyard.
    const activate = applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId });
    expect(activate.ok).toBe(true);
    expect(state.players[0].graveyard).toContain(instanceId);

    // Now its second, graveyard-only effect can be activated.
    const fromGrave = applyAction(state, 0, { type: 'ACTIVATE_EFFECT', effectId: 'WASP_SWARM_GRAVE', sourceInstanceId: instanceId });
    expect(fromGrave.ok).toBe(true);
    // WASP_SWARM_GRAVE's action is banishSelf — the card leaves the graveyard for exile.
    expect(state.players[0].graveyard).not.toContain(instanceId);
    expect(state.players[0].banished).toContain(instanceId);
  });
});
