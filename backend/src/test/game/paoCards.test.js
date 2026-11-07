// PAO cards programmed from the final card list.
const { connectDB, disconnectDB } = require('../../mongo/connection');
const { applyAction, viewFor } = require('../../game/engine');
const { getEffectiveStats, recomputeContinuous, fireTrigger } = require('../../game/effectEngine');
const { seedCatalog, makeDuel, toHand, toDeckTop, toGraveyard, onField, toPhase, passAll, monster } = require('./engineHelpers');
const { placePending, resolveAll, actPicking } = require('./chainHelpers');

beforeAll(async () => {
  await connectDB();
  await seedCatalog();
});

afterAll(async () => {
  await disconnectDB();
});

const atk = (state, id) => getEffectiveStats(monster(state, id)).atk;

describe('Anguila', () => {
  it('+1 Atk per Pez its player controls (itself included); special summon with a Pez', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const anguila = await toHand(state, 0, 'Anguila');
    expect(applyAction(state, 0, { type: 'SPECIAL_SUMMON', instanceId: anguila }).ok).toBe(false);
    await onField(state, 0, 'Manta-Raya'); // Pez
    expect(applyAction(state, 0, { type: 'SPECIAL_SUMMON', instanceId: anguila }).ok).toBe(true);
    placePending(state);
    recomputeContinuous(state);
    expect(atk(state, anguila)).toBe(2 + 2);
  });
});

describe('Koi Mágico', () => {
  it('Pez on the field can\'t be picked by card effects; Pez in its player\'s hand can be special summoned', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    await onField(state, 0, 'Koi Mágico');
    const anguila = await toHand(state, 0, 'Anguila');
    recomputeContinuous(state);
    expect(viewFor(state, 0).players[0].hand.find((c) => c.instanceId === anguila).specialSummonAvailable).toBe(true);
    const manta = await toHand(state, 0, 'Manta-Raya');
    expect(applyAction(state, 0, { type: 'SPECIAL_SUMMON', instanceId: manta }).ok).toBe(true);
    resolveAll(state);
    expect(monster(state, manta)).toBeDefined();
    // A Pez on the field can't be the target of a rival's Relámpago.
    toPhase(state, 'main1', 1);
    const relampago = await toHand(state, 1, 'Relámpago');
    const res = applyAction(state, 1, { type: 'ACTIVATE_SUPPORT', instanceId: relampago, targets: [manta] });
    expect(res.ok).toBe(false);
  });
});

describe('Tiburón de Grandes Fauces / Manta-Raya', () => {
  it('Tiburón sends a Marino from the Mazo to the Cementerio when summoned; once per turn brings a Pez back', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const target = await toDeckTop(state, 0, 'Anguila');
    const tiburon = await onField(state, 0, 'Tiburón de Grandes Fauces');
    fireTrigger(state, 'onSummon', { instanceId: tiburon, controllerIndex: 0, cardId: monster(state, tiburon).cardId, kind: 'special' });
    resolveAll(state);
    expect(state.players[0].graveyard).toContain(target);
    expect(actPicking(state, 0, { type: 'ACTIVATE_EFFECT', effectId: 'TIBURON_REVIVE_PEZ', sourceInstanceId: tiburon }).ok).toBe(true);
    passAll(state);
    resolveAll(state);
    expect(monster(state, target)).toBeDefined();
  });

  it('Manta-Raya: the rival discards a random card when it is summoned; special summon with 5 Agua', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const manta = await toHand(state, 0, 'Manta-Raya');
    for (let i = 0; i < 5; i++) await toGraveyard(state, 0, 'Anguila');
    await toHand(state, 1, 'Slime');
    await toHand(state, 1, 'Kraken');
    const hand = state.players[1].hand.length;
    expect(applyAction(state, 0, { type: 'SPECIAL_SUMMON', instanceId: manta }).ok).toBe(true);
    resolveAll(state);
    expect(state.players[1].hand.length).toBe(hand - 1);
  });
});

describe('Pecera de Cristal', () => {
  it('summons a Pez from the Cementerio, and another copy of it if there is one', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const a1 = await toGraveyard(state, 0, 'Anguila');
    const a2 = await toGraveyard(state, 0, 'Anguila');
    const other = await toGraveyard(state, 0, 'Manta-Raya');
    const card = await toHand(state, 0, 'Pecera de Cristal');
    state.players[0].pixelcoins = 10;
    const ask = applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: card, targets: [a1] });
    expect(ask.reason).toBe('choose-target');
    expect(ask.options.map((o) => o.instanceId)).toContain(a2);
    expect(ask.options.map((o) => o.instanceId)).not.toContain(other); // only copies of the first
    expect(applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: card, targets: [a1, a2] }).ok).toBe(true);
    passAll(state);
    resolveAll(state);
    expect(monster(state, a1)).toBeDefined();
    expect(monster(state, a2)).toBeDefined();
  });
});
