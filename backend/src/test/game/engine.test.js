const { connectDB, disconnectDB } = require('../../mongo/connection');
const { Card } = require('../../data/Schema/card');
const { Effect } = require('../../data/Schema/effect');
const { Deck } = require('../../data/Schema/deck');
const { User } = require('../../data/Schema/user');
const cards = require('../../data/seed/cards_final.json');
const effects = require('../../data/seed/effects_final.json');
const { createMatch, applyAction, viewFor } = require('../../game/engine');
const { runBotTurn } = require('../../game/botAI');

beforeAll(async () => {
  await connectDB();
  await Promise.all(effects.map((e) => Effect.findByIdAndUpdate(e._id, e, { upsert: true })));
  // `number` isn't in cards_final.json (the real seed script assigns it, preserving existing
  // ones); tests just need a unique number per card within this throwaway in-memory DB.
  for (let i = 0; i < cards.length; i++) {
    await Card.findOneAndUpdate({ name: cards[i].name }, { ...cards[i], number: i + 1 }, { upsert: true });
  }
});

afterAll(async () => {
  await disconnectDB();
});

// Free-to-summon AND effect-free monsters, so combat math in these tests is just raw ATK vs
// raw ATK/Vida — no continuous buff on the drawn card can shift the numbers depending on which
// one the (randomly shuffled) deck happens to put in hand.
async function getVanillaFreeMonsters(limit = 20) {
  return Card.find({ category: 'monster', 'summonCost.fn': { $exists: false }, effectCodes: { $size: 0 } })
    .limit(limit)
    .lean();
}

async function makeTestMatch({ vsBot = false } = {}) {
  const freeMonsters = await getVanillaFreeMonsters();
  const userA = await User.create({ userName: `EngineTestA${Date.now()}`, email: `enginetesta${Date.now()}@example.com`, password: 'x' });
  const deckDocA = await Deck.create({
    deckTitle: 'Test Deck A',
    owner: userA._id,
    cards: freeMonsters.map((c) => ({ card: c._id, amount: 2 })),
    fusionCards: [],
  });
  const populatedA = await Deck.findById(deckDocA._id).populate('cards.card').populate('fusionCards.card');

  let deckB;
  let playerB;
  if (vsBot) {
    playerB = 'BOT';
    deckB = { cards: freeMonsters.map((c) => ({ card: c._id, amount: 2 })), fusionCards: [] };
  } else {
    const userB = await User.create({ userName: `EngineTestB${Date.now()}`, email: `enginetestb${Date.now()}@example.com`, password: 'x' });
    const deckDocB = await Deck.create({
      deckTitle: 'Test Deck B',
      owner: userB._id,
      cards: freeMonsters.map((c) => ({ card: c._id, amount: 2 })),
      fusionCards: [],
    });
    playerB = userB._id.toString();
    deckB = await Deck.findById(deckDocB._id).populate('cards.card').populate('fusionCards.card');
  }

  const state = await createMatch({
    matchId: `test-${Date.now()}-${Math.random()}`,
    playerA: userA._id.toString(),
    deckA: populatedA,
    playerB,
    deckB,
    vsBot,
  });
  return state;
}

// Advances phases using whichever player currently holds priority, until `state.phase` matches
// `targetPhase` on turn number `targetTurn` (or later) — avoids manually counting ADVANCE_PHASE
// calls, which is easy to get off-by-one on since a call while already on 'end' is what
// triggers endTurn rather than simply moving forward, and turn 1 skips the Battle Phase
// entirely per the rulebook (the player going first can't battle on their first turn).
function advanceUntil(state, targetTurn, targetPhase) {
  let guard = 0;
  while ((state.turnNumber < targetTurn || state.phase !== targetPhase) && guard < 80) {
    guard++;
    applyAction(state, state.turnPlayer, { type: 'ADVANCE_PHASE' });
  }
}

describe('Game engine', () => {
  it('deals 6 cards to each player and starts turn 1 on the draw phase', async () => {
    const state = await makeTestMatch();
    expect(state.players[0].hand).toHaveLength(6);
    expect(state.players[1].hand).toHaveLength(6);
    expect(state.turnPlayer).toBe(0);
    expect(state.phase).toBe('draw');
  });

  it('gives no pixels on turn 1 (a player\'s own first turn) but 6 on their next turn, capped at 18', async () => {
    const state = await makeTestMatch();
    expect(state.players[0].pixelcoins).toBe(6); // starting pixels only, no turn-1 income
    advanceUntil(state, 3, 'draw'); // turn 1 (P0) -> turn 2 (P1) -> turn 3 (P0), draw phase already processed
    expect(state.players[0].pixelcoins).toBe(12); // 6 starting + 6 income on their second turn
  });

  it('skips both Battle and Principal 2 on the very first turn of the match', async () => {
    const state = await makeTestMatch();
    expect(state.phase).toBe('draw');
    applyAction(state, 0, { type: 'ADVANCE_PHASE' }); // draw -> standby
    applyAction(state, 0, { type: 'ADVANCE_PHASE' }); // standby -> main1
    expect(state.phase).toBe('main1');
    applyAction(state, 0, { type: 'ADVANCE_PHASE' }); // main1 -> end (no Battle, so no main2 either)
    expect(state.phase).toBe('end');
  });

  it('lets the turn player normal-summon a free monster from hand, once per turn', async () => {
    const state = await makeTestMatch();
    const instanceId = state.players[0].hand[0];
    const result = applyAction(state, 0, { type: 'NORMAL_SUMMON', instanceId, position: 'attack' });
    expect(result.ok).toBe(true);
    expect(state.players[0].field.monsters.some((m) => m && m.instanceId === instanceId)).toBe(true);
    expect(state.players[0].normalSummonUsed).toBe(true);

    const secondInstanceId = state.players[0].hand[0];
    const second = applyAction(state, 0, { type: 'NORMAL_SUMMON', instanceId: secondInstanceId, position: 'attack' });
    expect(second.ok).toBe(false);
    expect(second.reason).toBe('normal-summon-used');
  });

  it('supports exactly the 3 legal positions and rejects a face-down attack', async () => {
    // Face-up attack, face-up defense, and face-down ("set") defense are legal; a face-down
    // monster in attack position is not a real state a card can be in.
    const attackState = await makeTestMatch();
    const attackResult = applyAction(attackState, 0, { type: 'NORMAL_SUMMON', instanceId: attackState.players[0].hand[0], position: 'attack' });
    expect(attackResult.ok).toBe(true);

    const defenseState = await makeTestMatch();
    const defenseResult = applyAction(defenseState, 0, { type: 'NORMAL_SUMMON', instanceId: defenseState.players[0].hand[0], position: 'defense' });
    expect(defenseResult.ok).toBe(true);

    const setState = await makeTestMatch();
    const setResult = applyAction(setState, 0, { type: 'NORMAL_SUMMON', instanceId: setState.players[0].hand[0], position: 'defense', faceDown: true });
    expect(setResult.ok).toBe(true);

    const illegalState = await makeTestMatch();
    const illegalResult = applyAction(illegalState, 0, { type: 'NORMAL_SUMMON', instanceId: illegalState.players[0].hand[0], position: 'attack', faceDown: true });
    expect(illegalResult.ok).toBe(false);
    expect(illegalResult.reason).toBe('invalid-position');
  });

  it('rejects actions from the player who does not have the turn', async () => {
    const state = await makeTestMatch();
    const instanceId = state.players[1].hand[0];
    const result = applyAction(state, 1, { type: 'NORMAL_SUMMON', instanceId, position: 'attack' });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('not-your-turn');
  });

  it('blocks an attack the same turn a monster was summoned (summoning sickness)', async () => {
    const state = await makeTestMatch();
    advanceUntil(state, 3, 'main1'); // turn 1 has no battle phase at all, so summon on turn 3 instead
    const instanceId = state.players[0].hand[0];
    applyAction(state, 0, { type: 'NORMAL_SUMMON', instanceId, position: 'attack' });
    applyAction(state, 0, { type: 'ADVANCE_PHASE' }); // main1 -> battle
    const result = applyAction(state, 0, { type: 'DECLARE_ATTACK', attackerInstanceId: instanceId, targetInstanceId: null });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('summoning-sickness');
  });

  it('deals direct damage on an unblocked attack the turn after summoning', async () => {
    const state = await makeTestMatch();
    const instanceId = state.players[0].hand[0];
    const monsterCard = await Card.findById(instanceId.split(':')[1]).lean();
    applyAction(state, 0, { type: 'NORMAL_SUMMON', instanceId, position: 'attack' });
    advanceUntil(state, 3, 'battle'); // play out the rest of turn 1, all of turn 2, into turn 3's battle phase

    const vpBefore = state.players[1].vp;
    const result = applyAction(state, 0, { type: 'DECLARE_ATTACK', attackerInstanceId: instanceId, targetInstanceId: null });
    expect(result.ok).toBe(true);
    // VP can't go negative — with the current (unrebalanced) card ATK values often exceeding
    // the 80 starting VP, a single hit routinely floors the defender at 0 rather than landing
    // on a negative number.
    expect(state.players[1].vp).toBe(Math.max(0, vpBefore - (monsterCard.atk || 0)));
  });

  it('lets a bot play through its own turn without crashing or looping forever', async () => {
    const state = await makeTestMatch({ vsBot: true });
    advanceUntil(state, 2, 'draw'); // hands the turn off to the bot (player 1)
    expect(state.turnPlayer).toBe(1);

    runBotTurn(state, 1);

    expect(state.turnPlayer).toBe(0); // bot played through its whole turn and passed back
    expect(state.turnNumber).toBe(3);
  });

  it('produces a redacted view that hides the opponent hand contents', async () => {
    const state = await makeTestMatch();
    const view = viewFor(state, 0);
    expect(view.players[0].hand).toHaveLength(6);
    expect(view.players[1].hand).toBeUndefined();
    expect(view.players[1].handCount).toBe(6);
  });
});
