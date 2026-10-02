// The PvE bot: it tries its moves on a copy of the match (without seeing the rival's hidden cards),
// scores where each one leads and plays the best — so it picks sensible targets, doesn't make
// attacks it would lose, and never changes the real duel while it's thinking.
const { connectDB, disconnectDB } = require('../../mongo/connection');
const { Card } = require('../../data/Schema/card');
const { applyAction, createMatch } = require('../../game/engine');
const { runBotTurn } = require('../../game/botAI');
const { chooseAction } = require('../../game/bot/search');
const { determinize } = require('../../game/bot/simulate');
const { evaluate } = require('../../game/bot/evaluate');
const { seedCatalog, makeDuel, toHand, onField, toPhase, passAll, monster } = require('./engineHelpers');
const { STARTING_VP } = require('../../game/constants');

beforeAll(async () => {
  await connectDB();
  await seedCatalog();
});

afterAll(async () => {
  await disconnectDB();
});

// The bot plays its whole turn; the human (player 0) always passes when the Pila waits on them.
function botTurn(state, bot = 1) {
  for (let i = 0; i < 40 && state.status === 'active' && (state.turnPlayer === bot || state.chain.length); i++) {
    runBotTurn(state, bot);
    if (state.chain.length && state.priorityPlayer !== bot) applyAction(state, state.priorityPlayer, { type: 'PASS_CHAIN' });
  }
}

describe('Bot decisions', () => {
  it("Relámpago: destroys the rival's strongest monster, not its own", async () => {
    const state = await makeDuel();
    const mine = await onField(state, 1, 'Slime');
    const weak = await onField(state, 0, 'Slime');
    const strong = await onField(state, 0, 'Orco Gladiador');
    await toHand(state, 1, 'Relámpago');
    toPhase(state, 'main1', 1);
    const action = chooseAction(state, 1);
    expect(action).toMatchObject({ type: 'ACTIVATE_SUPPORT' });
    expect(applyAction(state, 1, action).ok).toBe(true);
    passAll(state);
    expect(monster(state, strong)).toBeUndefined();
    expect(monster(state, weak)).toBeDefined();
    expect(monster(state, mine)).toBeDefined();
  });

  it('attacks straight at the VP when the rival has no monsters', async () => {
    const state = await makeDuel();
    const orco = await onField(state, 1, 'Orco Gladiador');
    toPhase(state, 'battle', 1);
    expect(chooseAction(state, 1)).toMatchObject({ type: 'DECLARE_ATTACK', attackerInstanceId: orco, targetInstanceId: null });
  });

  it('does not attack a stronger monster in attack position', async () => {
    const state = await makeDuel();
    await onField(state, 1, 'Slime');
    await onField(state, 0, 'Orco Gladiador');
    toPhase(state, 'battle', 1);
    const action = chooseAction(state, 1);
    expect(action === null || action.type !== 'DECLARE_ATTACK').toBe(true);
  });

  it('summons its monster from hand in its main phase', async () => {
    const state = await makeDuel();
    const orco = await toHand(state, 1, 'Orco Gladiador');
    toPhase(state, 'main1', 1);
    expect(chooseAction(state, 1)).toMatchObject({ type: 'NORMAL_SUMMON', instanceId: orco });
  });

  it("thinking never changes the real duel, and the copy hides the rival's cards", async () => {
    const state = await makeDuel();
    await onField(state, 0, 'Orco Gladiador', { position: 'defense', faceDown: true });
    await toHand(state, 0, 'Relámpago');
    await toHand(state, 1, 'Relámpago');
    await onField(state, 1, 'Orco Guerrero');
    toPhase(state, 'main1', 1);
    const before = JSON.stringify(state);
    chooseAction(state, 1);
    expect(JSON.stringify(state)).toBe(before);

    const { sim } = determinize(state, 1);
    expect(sim.players[0].hand).toHaveLength(state.players[0].hand.length);
    expect(sim.players[0].deck).toHaveLength(state.players[0].deck.length);
    expect(sim.players[0].field.monsters.filter(Boolean)).toHaveLength(1);
    // Scoring the board doesn't depend on what the rival's face-down monster really is.
    expect(evaluate(sim, 1)).toBeCloseTo(evaluate(state, 1));
  });

  it('plays a whole turn and hands it back', async () => {
    const state = await makeDuel();
    await toHand(state, 1, 'Orco Gladiador');
    await toHand(state, 1, 'Relámpago');
    await onField(state, 0, 'Slime');
    toPhase(state, 'main1', 1);
    const turn = state.turnNumber;
    botTurn(state);
    expect(state.turnPlayer).toBe(0);
    expect(state.turnNumber).toBe(turn + 1);
  });
});

describe('Bot against bot', () => {
  // Every card in the catalog, one copy each, so the bots run into as many effects as possible.
  async function catalogDeck() {
    const cards = await Card.find({ category: { $in: ['monster', 'support', 'fusion'] } }).lean();
    return {
      cards: cards.filter((c) => c.category !== 'fusion').map((card) => ({ card, amount: 1 })),
      fusionCards: cards.filter((c) => c.category === 'fusion').map((card) => ({ card, amount: 1 })),
    };
  }

  it('two bots play a duel without errors or getting stuck', async () => {
    const deck = await catalogDeck();
    const state = await createMatch({ matchId: `bvb-${Date.now()}`, playerA: 'BOT_A', deckA: deck, playerB: 'BOT_B', deckB: deck, vsBot: true, firstPlayer: 0 });
    const started = Date.now();
    let lastTurn = state.turnNumber;
    let stuck = 0;
    for (let i = 0; i < 400 && state.status === 'active' && state.turnNumber <= 20; i++) {
      const pending = state.pendingTriggerChoices && state.pendingTriggerChoices[0];
      const who = pending ? pending.controllerIndex : state.chain.length ? state.priorityPlayer : state.turnPlayer;
      runBotTurn(state, who);
      stuck = state.turnNumber === lastTurn ? stuck + 1 : 0;
      lastTurn = state.turnNumber;
      expect(stuck).toBeLessThan(30);
    }
    expect(state.turnNumber > 8 || state.status !== 'active').toBe(true);
    expect(state.players.every((p) => p.vp <= STARTING_VP * 3)).toBe(true);
    expect(Date.now() - started).toBeLessThan(30000); // the bot thinks within a time budget
  }, 120000);
});
