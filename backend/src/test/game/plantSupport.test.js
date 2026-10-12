// The four test Plantas (SBE): their effects work, and they can't be got.
const { connectDB, disconnectDB } = require('../../mongo/connection');
const { applyAction } = require('../../game/engine');
const { recomputeContinuous } = require('../../game/effectEngine');
const { seedCatalog, makeDuel, toHand, toDeckTop, toGraveyard, onField, toPhase, passAll, monster } = require('./engineHelpers');
const { placePending } = require('./chainHelpers');

beforeAll(async () => {
  await connectDB();
  await seedCatalog();
});

afterAll(async () => {
  await disconnectDB();
});

const relampago = async (state, p, target) => {
  const card = await toHand(state, p, 'Relámpago');
  expect(applyAction(state, p, { type: 'ACTIVATE_SUPPORT', instanceId: card, targets: [target] }).ok).toBe(true);
  passAll(state);
};

describe('Clionne, Dama Ramificada del Bosque', () => {
  it('the other Plantas on its side can\'t be destroyed by card effects; Clionne itself and the rest can', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 1);
    const clionne = await onField(state, 0, 'Clionne, Dama Ramificada del Bosque');
    const ent = await onField(state, 0, 'Ent');
    const orco = await onField(state, 0, 'Orco Guerrero');
    recomputeContinuous(state);
    await relampago(state, 1, ent);
    expect(monster(state, ent)).toBeDefined();
    await relampago(state, 1, orco);
    expect(monster(state, orco)).toBeUndefined();
    await relampago(state, 1, clionne);
    expect(monster(state, clionne)).toBeUndefined();
    // Without Clionne the protection is gone.
    state.turnLimits = {};
    await relampago(state, 1, ent);
    expect(monster(state, ent)).toBeUndefined();
  });
});

describe('Grook, el Árbol Guardián', () => {
  it('digs the top 3 cards and adds a Planta monster among them (the player picks); nothing found is fine', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const grook = await onField(state, 0, 'Grook, el Árbol Guardián');
    const deep = await toDeckTop(state, 0, 'Ent'); // 4th from the top: not reached
    const cactus = await toDeckTop(state, 0, 'Cactus Violento');
    await toDeckTop(state, 0, 'Orco Guerrero');
    const espora = await toDeckTop(state, 0, 'Espora Venenosa');
    const ask = applyAction(state, 0, { type: 'ACTIVATE_EFFECT', effectId: 'GROOK_EXCAVATE', sourceInstanceId: grook });
    expect(ask).toMatchObject({ ok: false, reason: 'choose-target' });
    expect(ask.options.map((o) => o.instanceId).sort()).toEqual([cactus, espora].sort());
    expect(applyAction(state, 0, { type: 'ACTIVATE_EFFECT', effectId: 'GROOK_EXCAVATE', sourceInstanceId: grook, targets: [cactus] }).ok).toBe(true);
    passAll(state);
    expect(state.players[0].hand).toContain(cactus);
    expect(state.players[0].deck).toContain(deep);
    expect(state.players[0].deck[0]).toBe(espora); // the rest stay where they were

    const other = await makeDuel();
    toPhase(other, 'main1', 0);
    const grook2 = await onField(other, 0, 'Grook, el Árbol Guardián');
    const hand = other.players[0].hand.length;
    expect(applyAction(other, 0, { type: 'ACTIVATE_EFFECT', effectId: 'GROOK_EXCAVATE', sourceInstanceId: grook2 }).ok).toBe(true); // a Mazo of Krakens
    passAll(other);
    expect(other.players[0].hand).toHaveLength(hand);
  });
});

describe('Poder de las Plantas', () => {
  it('the rival can only attack the strongest monster', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 1);
    const poder = await toHand(state, 1, 'Poder de las Plantas');
    expect(applyAction(state, 1, { type: 'ACTIVATE_SUPPORT', instanceId: poder }).ok).toBe(true);
    passAll(state);
    const weak = await onField(state, 1, 'Slime');
    const strong = await onField(state, 1, 'Orco Guerrero');
    const attacker = await onField(state, 0, 'Gigante de Fuego');
    recomputeContinuous(state);
    toPhase(state, 'battle', 0);
    const declare = (target) => applyAction(state, 0, { type: 'DECLARE_ATTACK', attackerInstanceId: attacker, targetInstanceId: target });
    expect(declare(weak)).toMatchObject({ ok: false, reason: 'must-attack-strongest' });
    expect(declare(null)).toMatchObject({ ok: false });
    expect(declare(strong).ok).toBe(true);
  });
});

describe('Renovación de Vida', () => {
  it('summons a Planta from the hand; from the Cementerio it shuffles 2 Plantas back and draws', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const card = await toHand(state, 0, 'Renovación de Vida');
    expect(applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: card })).toMatchObject({ ok: false, reason: 'no-legal-target' });
    const ent = await toHand(state, 0, 'Ent');
    expect(applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: card }).ok).toBe(true);
    passAll(state);
    placePending(state);
    expect(monster(state, ent)).toBeDefined();
    expect(state.players[0].graveyard).toContain(card);

    state.graveyardTurn[card] = state.turnNumber - 1;
    const a = await toGraveyard(state, 0, 'Cactus Violento');
    const fromGrave = (targets) => applyAction(state, 0, { type: 'ACTIVATE_EFFECT', effectId: 'RENOVACION_VIDA_GY_SHUFFLE_DRAW', sourceInstanceId: card, targets });
    expect(fromGrave([])).toMatchObject({ ok: false, reason: 'no-legal-target' }); // only one Planta there
    const b = await toGraveyard(state, 0, 'Espora Venenosa');
    const hand = state.players[0].hand.length;
    expect(fromGrave([]).ok).toBe(true);
    passAll(state);
    expect(state.players[0].deck).toEqual(expect.arrayContaining([a, b]));
    expect(state.players[0].banished).toContain(card);
    expect(state.players[0].hand).toHaveLength(hand + 1);
  });
});
