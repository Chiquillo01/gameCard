// The duel's numbers come from the database (GameRules), not from code: changing them there is
// enough for the next duel and for what the client is told.
const request = require('supertest');
const { connectDB, disconnectDB } = require('../../mongo/connection');
const { GameRules } = require('../../data/Schema/gameRules');
const { loadRules, rules } = require('../../game/rules');
const { isDeckPlayable } = require('../../game/deckRules');
const { seedCatalog, makeDuel } = require('./engineHelpers');
const defaults = require('../../data/seed/game_rules_final.json');

let app;
beforeAll(async () => {
  await connectDB();
  await seedCatalog();
  app = require('../../bootstrap').bootstrapApp();
});

afterAll(async () => {
  await GameRules.deleteMany({});
  await loadRules();
  await disconnectDB();
});

describe('Game rules from the database', () => {
  it('a new duel starts with the VP, pixels and hand the database says', async () => {
    await GameRules.replaceOne({ _id: 'rules' }, { _id: 'rules', ...defaults, startingVp: 33, startingPixels: 7, startingHandSize: 5 }, { upsert: true });
    await loadRules();
    const state = await makeDuel();
    expect(state.players.map((p) => p.vp)).toEqual([33, 33]);
    expect(rules().startingPixels).toBe(7);
  });

  it('deck sizes too, and the client gets them from GET /rules', async () => {
    await GameRules.replaceOne({ _id: 'rules' }, { _id: 'rules', ...defaults, minDeckSize: 2, maxDeckSize: 3 }, { upsert: true });
    const res = await request(app).get('/rules');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ minDeckSize: 2, maxDeckSize: 3, startingVp: defaults.startingVp });
    expect(res.body._id).toBeUndefined();
    expect(isDeckPlayable({ cards: [{ card: 'x', amount: 2 }], fusionCards: [] })).toBe(true);
  });

  it('without a rules document, the seed file is used', async () => {
    await GameRules.deleteMany({});
    await loadRules();
    expect(rules()).toMatchObject(defaults);
  });
});
