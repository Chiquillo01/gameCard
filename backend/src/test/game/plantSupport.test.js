// The Plantas test cards (SBE): their effects work as the current card texts say.
const { connectDB, disconnectDB } = require('../../mongo/connection');
const { applyAction } = require('../../game/engine');
const { recomputeContinuous } = require('../../game/effectEngine');
const { seedCatalog, makeDuel, toHand, onField, toPhase, passAll, monster } = require('./engineHelpers');
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
  it('once per turn, +1 Vida to a Planta monster on its own side (the player picks; itself too)', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const grook = await onField(state, 0, 'Grook, el Árbol Guardián');
    const ent = await onField(state, 0, 'Ent');
    await onField(state, 0, 'Orco Guerrero'); // not a Planta
    await onField(state, 1, 'Cactus Violento'); // a Planta, but the rival's
    const grow = (targets) => applyAction(state, 0, { type: 'ACTIVATE_EFFECT', effectId: 'GROOK_PLANT_GROW', sourceInstanceId: grook, targets });
    const ask = grow();
    expect(ask).toMatchObject({ ok: false, reason: 'choose-target' });
    expect(ask.options.map((o) => o.instanceId).sort()).toEqual([grook, ent].sort());
    const vida = monster(state, ent).baseDef;
    expect(grow([ent]).ok).toBe(true);
    passAll(state);
    recomputeContinuous(state);
    expect(monster(state, ent).baseDef).toBe(vida + 1);
    expect(grow([ent])).toMatchObject({ ok: false, reason: 'once-per-turn' });
  });
});

describe('Poder de las Plantas', () => {
  it('the rival can only attack the monster with the most Vida', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 1);
    const poder = await toHand(state, 1, 'Poder de las Plantas');
    expect(applyAction(state, 1, { type: 'ACTIVATE_SUPPORT', instanceId: poder }).ok).toBe(true);
    passAll(state);
    const tough = await onField(state, 1, 'Ent');
    const other = await onField(state, 1, 'Slime');
    monster(state, tough).baseDef = 9;
    monster(state, tough).baseAtk = 1;
    monster(state, other).baseDef = 1;
    monster(state, other).baseAtk = 9;
    const attacker = await onField(state, 0, 'Gigante de Fuego');
    recomputeContinuous(state);
    toPhase(state, 'battle', 0);
    const declare = (target) => applyAction(state, 0, { type: 'DECLARE_ATTACK', attackerInstanceId: attacker, targetInstanceId: target });
    expect(declare(other)).toMatchObject({ ok: false, reason: 'must-attack-strongest' });
    expect(declare(null)).toMatchObject({ ok: false });
    expect(declare(tough).ok).toBe(true);
  });
});

describe('Renovación de Vida', () => {
  it('summons a Planta from the hand, and needs one there', async () => {
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
  });
});
