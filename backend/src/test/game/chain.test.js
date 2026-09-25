// Rulebook, "Apilar" / "Velocidades": activating a card opens a response window instead of
// resolving on the spot — the other player always gets a chance to respond or pass first.
const { connectDB, disconnectDB } = require('../../mongo/connection');
const { Card } = require('../../data/Schema/card');
const { Effect } = require('../../data/Schema/effect');
const { Deck } = require('../../data/Schema/deck');
const { User } = require('../../data/Schema/user');
const cards = require('../../data/seed/cards_final.json');
const effects = require('../../data/seed/effects_final.json');
const { createMatch, applyAction, viewFor } = require('../../game/engine');
const { placeSupport } = require('../../game/zones');
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
    const user = await User.create({ userName: `Ch${tag}${Date.now()}`, email: `ch${tag}${Date.now()}@example.com`, password: 'x' });
    const deck = await Deck.create({ deckTitle: tag, owner: user._id, cards: names.map((n) => ({ card: byName.get(n)._id, amount: 1 })), fusionCards: [] });
    return { user, deck: await Deck.findById(deck._id).populate('cards.card').populate('fusionCards.card') };
  };
  const a = await mk('A', namesA);
  const b = await mk('B', namesB);
  const state = await createMatch({
    matchId: `ch-${Date.now()}-${Math.random()}`,
    playerA: a.user._id.toString(),
    deckA: a.deck,
    playerB: b.user._id.toString(),
    deckB: b.deck,
    vsBot: false,
  });
  const inHand = (name, p = 0) => state.players[p].hand.find((id) => id.split(':')[1] === byName.get(name)._id.toString());
  return { state, inHand, byName };
}

function toMain1(state) {
  while (state.phase !== 'main1') applyAction(state, state.turnPlayer, { type: 'ADVANCE_PHASE' });
}

describe('Activating a card opens a chain instead of resolving right away', () => {
  it('places a Normal Apoyo on the Campo (not the graveyard) and opens the window', async () => {
    const { state, inHand } = await makeMatch(['Chispa', 'Kraken']);
    toMain1(state);
    state.players[0].pixelcoins = 6;
    const id = inHand('Chispa');

    const res = applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: id });
    expect(res.ok).toBe(true);
    expect(state.players[0].field.support.some((s) => s && s.instanceId === id)).toBe(true);
    expect(state.players[0].graveyard).not.toContain(id);
    expect(state.players[1].vp).toBe(80); // burnOpponent hasn't resolved yet
    expect(state.priorityPlayer).toBe(1);

    const view = viewFor(state, 1);
    expect(view.chain).toMatchObject({ priorityPlayer: 1, links: [{ cardName: 'Chispa' }] });
  });

  it('blocks every other action while the chain is open, even for the turn player', async () => {
    const { state, inHand } = await makeMatch(['Chispa', 'Kraken']);
    toMain1(state);
    state.players[0].pixelcoins = 6;
    applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: inHand('Chispa') });

    expect(applyAction(state, 0, { type: 'ADVANCE_PHASE' })).toMatchObject({ ok: false, reason: 'chain-open' });
    expect(applyAction(state, 0, { type: 'PASS_CHAIN' })).toMatchObject({ ok: false, reason: 'not-your-priority' });
  });

  it('resolves and sends the Normal Apoyo to the graveyard once both sides pass', async () => {
    const { state, inHand } = await makeMatch(['Chispa', 'Kraken']);
    toMain1(state);
    state.players[0].pixelcoins = 6;
    const id = inHand('Chispa');
    applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: id });

    passChain(state);
    expect(state.players[1].vp).toBe(70);
    expect(state.players[0].field.support.some((s) => s && s.instanceId === id)).toBe(false);
    expect(state.players[0].graveyard).toContain(id);
    expect(state.chain).toEqual([]);
  });

  it('rejects a Speed 1 response (a second Normal Apoyo can\'t chain onto the first)', async () => {
    const { state, inHand } = await makeMatch(['Chispa', 'Chispa', 'Kraken']);
    toMain1(state);
    state.players[0].pixelcoins = 6;
    const [first, second] = state.players[0].hand.filter((id) => id.split(':')[1] === inHand('Chispa').split(':')[1]);
    applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: first });
    applyAction(state, 1, { type: 'PASS_CHAIN' });

    expect(applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: second })).toMatchObject({ ok: false, reason: 'too-slow' });
  });

  it('Djinni (Speed 3) negates the activation it responds to and sends that card to the graveyard', async () => {
    const { state, inHand } = await makeMatch(['Djinni', 'Kraken'], ['Chispa', 'Kraken']);
    toMain1(state);
    const djinni = inHand('Djinni');
    placeSupport(state, djinni, 0, { faceDown: true });

    // Hand play to player 1's main phase directly — these 2-card test decks would deck out long
    // before a real ADVANCE_PHASE loop got there.
    state.turnPlayer = 1;
    state.firstTurn = false;
    state.turnNumber = 3;
    state.phase = 'main1';
    state.players[1].pixelcoins = 6;
    const chispaId = inHand('Chispa', 1);
    const vpBefore = state.players[0].vp;
    expect(applyAction(state, 1, { type: 'ACTIVATE_SUPPORT', instanceId: chispaId })).toMatchObject({ ok: true });
    expect(state.priorityPlayer).toBe(0);

    // Player 0 responds with Djinni's own counter effect instead of passing.
    const res = applyAction(state, 0, { type: 'ACTIVATE_EFFECT', effectId: 'DJINNI_COUNTER_NEGATE', sourceInstanceId: djinni });
    expect(res.ok).toBe(true);
    passChain(state);

    // Chispa never resolved (no VP loss) and was sent to the graveyard by Djinni's negate.
    expect(state.players[0].vp).toBe(vpBefore);
    expect(state.players[1].graveyard).toContain(chispaId);
    expect(state.chain).toEqual([]);
  });
});

describe('Automatic triggers with a search also wait on the player, not random', () => {
  it('Avispa de Obsidiana\'s on-summon search defers to a pick with more than one match', async () => {
    const { state, inHand } = await makeMatch(['Avispa de Obsidiana', 'Avispa gigante', 'Avispa Mutante', 'Kraken']);
    const { getCard } = require('../../game/cardIndex');
    // Two Avispas go back to the deck so there's something ambiguous to search for.
    ['Avispa gigante', 'Avispa Mutante'].forEach((name) => {
      const id = inHand(name);
      state.players[0].hand = state.players[0].hand.filter((i) => i !== id);
      state.players[0].deck.push(id);
    });
    toMain1(state);
    const id = inHand('Avispa de Obsidiana');

    const res = applyAction(state, 0, { type: 'NORMAL_SUMMON', instanceId: id, position: 'attack' });
    expect(res.ok).toBe(true);
    // The search hasn't happened yet — nothing was grabbed at random.
    expect(state.players[0].deck.length).toBe(2);

    const view = viewFor(state, 0);
    expect(view.pendingTriggerChoice.options).toHaveLength(2);
    expect(new Set(view.pendingTriggerChoice.options.map((o) => o.name))).toEqual(new Set(['Avispa gigante', 'Avispa Mutante']));

    // Everything else is blocked meanwhile.
    expect(applyAction(state, 0, { type: 'ADVANCE_PHASE' })).toMatchObject({ ok: false, reason: 'trigger-choice-pending' });

    const chosenName = view.pendingTriggerChoice.options[0].name;
    const chosenId = state.players[0].deck.find((cid) => getCard(cid.split(':')[1]).name === chosenName);
    expect(applyAction(state, 0, { type: 'RESOLVE_TRIGGER_CHOICE', targets: [chosenId] })).toMatchObject({ ok: true });

    expect(state.players[0].hand).toContain(chosenId);
    expect(state.players[0].deck.length).toBe(1);
    expect(viewFor(state, 0).pendingTriggerChoice).toBeNull();
  });
});
