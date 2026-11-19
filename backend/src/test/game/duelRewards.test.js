// A finished duel pays Pixelcoins (and, against another player, Pixelgems): more for the winner,
// something for the loser, nothing for a surrender or a duel that ends before `minTurns`.
const { connectDB, disconnectDB } = require('../../mongo/connection');
const { User } = require('../../data/Schema/user');
const { MatchResult } = require('../../data/Schema/matchResult');
const { applyAction, viewFor } = require('../../game/engine');
const matchStore = require('../../game/matchStore');
const { computeDuelRewards, grantDuelRewards } = require('../../services/duelRewards');
const { seedCatalog, makeDuel } = require('./engineHelpers');
const defaults = require('../../data/seed/game_rules_final.json');

const config = {
  minTurns: 3,
  vsBot: { win: { pixelcoins: 50, pixelgems: 0 }, loss: { pixelcoins: 15, pixelgems: 0 } },
  pvp: { win: { pixelcoins: 100, pixelgems: 2 }, loss: { pixelcoins: 25, pixelgems: 0 } },
};

const finished = (overrides = {}) => ({
  status: 'finished',
  winnerIndex: 0,
  turnNumber: 5,
  vsBot: false,
  players: [{ userId: 'a' }, { userId: 'b' }],
  ...overrides,
});

describe('computeDuelRewards', () => {
  it('pays the winner and the loser of a duel between players', () => {
    expect(computeDuelRewards(finished(), config)).toEqual([
      { pixelcoins: 100, pixelgems: 2 },
      { pixelcoins: 25, pixelgems: 0 },
    ]);
  });

  it('against the bot uses the vsBot table and gives the bot nothing', () => {
    const state = finished({ vsBot: true, winnerIndex: 1, players: [{ userId: 'a' }, { userId: 'BOT' }] });
    expect(computeDuelRewards(state, config)).toEqual([{ pixelcoins: 15, pixelgems: 0 }, null]);
    expect(computeDuelRewards({ ...state, winnerIndex: 0 }, config)).toEqual([{ pixelcoins: 50, pixelgems: 0 }, null]);
  });

  it('a player who surrenders gets nothing; the winner still gets the win', () => {
    expect(computeDuelRewards(finished({ surrenderedBy: 1 }), config)).toEqual([
      { pixelcoins: 100, pixelgems: 2 },
      { pixelcoins: 0, pixelgems: 0 },
    ]);
  });

  it('a duel that ends before minTurns pays nobody', () => {
    expect(computeDuelRewards(finished({ turnNumber: 2 }), config)).toEqual([
      { pixelcoins: 0, pixelgems: 0 },
      { pixelcoins: 0, pixelgems: 0 },
    ]);
  });

  it('an unfinished duel, or no reward table, pays nothing', () => {
    expect(computeDuelRewards(finished({ status: 'active', winnerIndex: null }), config)).toEqual([
      { pixelcoins: 0, pixelgems: 0 },
      { pixelcoins: 0, pixelgems: 0 },
    ]);
    expect(computeDuelRewards(finished(), null)).toEqual([
      { pixelcoins: 0, pixelgems: 0 },
      { pixelcoins: 0, pixelgems: 0 },
    ]);
  });

  it('the seed rules carry a reward table', () => {
    expect(defaults.duelRewards).toMatchObject({ minTurns: expect.any(Number), vsBot: expect.any(Object), pvp: expect.any(Object) });
  });
});

describe('Duel rewards are paid once the duel ends', () => {
  beforeAll(async () => {
    await connectDB();
    await seedCatalog();
  });

  afterAll(async () => {
    await disconnectDB();
  });

  const balance = async (userId) => {
    const user = await User.findById(userId).lean();
    return { pixelcoins: user.pixelcoins, pixelgems: user.pixelgems };
  };

  it('adds the reward to each balance, shows it to each player and records it', async () => {
    const state = await makeDuel();
    state.turnNumber = 6;
    const [a, b] = state.players.map((p) => p.userId);
    const before = [await balance(a), await balance(b)];

    applyAction(state, 1, { type: 'SURRENDER' });
    matchStore.save(state);
    // state.rewards is set at once, before the balances are written.
    expect(viewFor(state, 0).reward).toEqual(defaults.duelRewards.pvp.win);
    expect(viewFor(state, 1).reward).toEqual({ pixelcoins: 0, pixelgems: 0 });

    await new Promise((r) => setTimeout(r, 200));
    expect(await balance(a)).toEqual({
      pixelcoins: before[0].pixelcoins + defaults.duelRewards.pvp.win.pixelcoins,
      pixelgems: before[0].pixelgems + defaults.duelRewards.pvp.win.pixelgems,
    });
    expect(await balance(b)).toEqual(before[1]);

    const result = await MatchResult.findOne({ 'players.userId': a }).lean();
    expect(result.players[0].reward).toEqual(defaults.duelRewards.pvp.win);
  });

  it('saving a finished duel again does not pay twice', async () => {
    const state = await makeDuel();
    state.turnNumber = 6;
    const a = state.players[0].userId;
    applyAction(state, 1, { type: 'SURRENDER' });
    matchStore.save(state);
    await new Promise((r) => setTimeout(r, 200));
    const once = await balance(a);
    matchStore.save(state);
    await new Promise((r) => setTimeout(r, 200));
    expect(await balance(a)).toEqual(once);
  });

  it('grantDuelRewards leaves the bot alone', async () => {
    const state = await makeDuel();
    state.turnNumber = 6;
    state.vsBot = true;
    state.players[1].userId = 'BOT';
    applyAction(state, 0, { type: 'SURRENDER' });
    const rewards = await grantDuelRewards(state);
    expect(rewards).toEqual([{ pixelcoins: 0, pixelgems: 0 }, null]);
  });
});
