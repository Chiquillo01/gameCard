// IdL cards fixed after play-testing.
const { connectDB, disconnectDB } = require('../../mongo/connection');
const { applyAction } = require('../../game/engine');
const { recomputeContinuous, getEffectiveStats } = require('../../game/effectEngine');
const { placeMonster } = require('../../game/zones');
const { isNegated } = require('../../game/negation');
const { seedCatalog, makeDuel, instance, toHand, onField, toPhase, passAll, monster } = require('./engineHelpers');
const { placePending } = require('./chainHelpers');

beforeAll(async () => {
  await connectDB();
  await seedCatalog();
});

afterAll(async () => {
  await disconnectDB();
});

describe('Solar, el Vergudo de los Cielos', () => {
  it('every Inframundo monster on the field has 0 Atk and 0 Vida; Solar keeps its own', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const solar = await instance(0, 'Solar, el Vergudo de los Cielos');
    placeMonster(state, solar, 0, { position: 'attack' });
    const vampiro = await onField(state, 1, 'Vampiro'); // Inframundo
    const kraken = await onField(state, 1, 'Kraken'); // not Inframundo
    recomputeContinuous(state);
    expect(getEffectiveStats(monster(state, vampiro))).toEqual({ atk: 0, def: 0 });
    expect(getEffectiveStats(monster(state, kraken)).atk).toBeGreaterThan(0);
    expect(getEffectiveStats(monster(state, solar)).atk).toBeGreaterThan(0);
  });
});

describe('Des - Compilación', () => {
  it('decompiles the picked Compilación and negates the effects of the materials that come back', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const berserker = await instance(1, 'Héroe Berserker');
    state.players[1].extra.push(berserker);
    const mats = [await onField(state, 1, 'Héroe Silencioso'), await onField(state, 1, 'Héroe Montado')];
    toPhase(state, 'main1', 1);
    expect(applyAction(state, 1, { type: 'COMPILE_SUMMON', instanceId: berserker, materialInstanceIds: mats }).ok).toBe(true);
    placePending(state);
    toPhase(state, 'main1', 0);
    const card = await toHand(state, 0, 'Des - Compilación');
    state.players[0].pixelcoins = 5;
    expect(applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: card }).ok).toBe(true);
    passAll(state);
    placePending(state);
    expect(monster(state, berserker)).toBeUndefined();
    expect(state.players[1].extra).toContain(berserker);
    mats.forEach((id) => {
      expect(monster(state, id)).toBeDefined();
      expect(isNegated(state, monster(state, id))).toBe(true);
    });
  });
});
