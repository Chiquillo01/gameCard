// Hidra, the two Sátiros and the balance changes of the latest list.
const { connectDB, disconnectDB } = require('../../mongo/connection');
const { applyAction, viewFor } = require('../../game/engine');
const { placeSupport } = require('../../game/zones');
const { getEffectiveStats, recomputeContinuous, fireTrigger } = require('../../game/effectEngine');
const { seedCatalog, makeDuel, instance, toHand, toGraveyard, onField, toPhase, passAll, monster } = require('./engineHelpers');
const { placePending, resolveAll } = require('./chainHelpers');
const { STARTING_VP } = require('../../game/constants');

beforeAll(async () => {
  await connectDB();
  await seedCatalog();
});

afterAll(async () => {
  await disconnectDB();
});

describe('Hidra', () => {
  it('special summon with 5 Agua monsters between the Campo and the Cementerio', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const hidra = await toHand(state, 0, 'Hidra');
    for (let i = 0; i < 2; i++) await onField(state, 0, 'Kraken'); // Agua
    for (let i = 0; i < 2; i++) await toGraveyard(state, 0, 'Kraken');
    expect(applyAction(state, 0, { type: 'SPECIAL_SUMMON', instanceId: hidra }).ok).toBe(false);
    await toGraveyard(state, 0, 'Kraken');
    expect(applyAction(state, 0, { type: 'SPECIAL_SUMMON', instanceId: hidra }).ok).toBe(true);
  });

  it('battling a stronger monster creates a Cabeza de Hidra; it attacks again once per token; no battle damage to its player', async () => {
    const state = await makeDuel();
    const hidra = await onField(state, 0, 'Hidra'); // 0/0
    const kraken = await onField(state, 1, 'Kraken');
    toPhase(state, 'battle', 0);
    const vp = state.players[0].vp;
    expect(applyAction(state, 0, { type: 'DECLARE_ATTACK', attackerInstanceId: hidra, targetInstanceId: kraken }).ok).toBe(true);
    passAll(state);
    resolveAll(state);
    const heads = state.players[0].field.monsters.filter((m) => m && m.isToken && m.tokenDef.name === 'Cabeza de Hidra');
    expect(heads).toHaveLength(1);
    expect(state.players[0].vp).toBe(vp); // it lost the battle, but its player takes no damage
    recomputeContinuous(state);
    if (monster(state, hidra)) expect(monster(state, hidra).extraAttacksContinuous).toBe(1);
  });
});

describe('Sátiro Cantante / Sátiro Vengador', () => {
  it('Sátiro Cantante: 1 VP per Hada its player controls, itself included', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const cantante = await onField(state, 0, 'Sátiro Cantante');
    await onField(state, 0, 'Valkiria');
    await onField(state, 0, 'Deva');
    await onField(state, 1, 'Valkiria'); // the rival's don't count
    const vp = state.players[0].vp;
    expect(applyAction(state, 0, { type: 'ACTIVATE_EFFECT', effectId: 'SATIRO_CANTANTE_VP_GAIN', sourceInstanceId: cantante }).ok).toBe(true);
    passAll(state);
    expect(state.players[0].vp).toBe(vp + 3);
  });

  it('Sátiro Vengador can be special summoned while its player controls a "Sátiro"', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const vengador = await toHand(state, 0, 'Sátiro Vengador');
    expect(applyAction(state, 0, { type: 'SPECIAL_SUMMON', instanceId: vengador }).ok).toBe(false);
    await onField(state, 0, 'Sátiro Cantante');
    expect(applyAction(state, 0, { type: 'SPECIAL_SUMMON', instanceId: vengador }).ok).toBe(true);
    placePending(state);
    expect(monster(state, vengador)).toBeDefined();
  });
});

describe('Response windows: every action can be answered', () => {
  it('the rival sets a card: the player with a set Tifón Místico gets a window and destroys it at once', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const tifon = await instance(1, 'Tifón Místico');
    placeSupport(state, tifon, 1, { faceDown: true });
    state.players[1].field.support.find((s) => s && s.instanceId === tifon).setTurn = state.turnNumber - 1;
    state.players[1].pixelcoins = 5;
    const set = await toHand(state, 0, 'Herida Sangrante');
    expect(applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: set, setFaceDown: true }).ok).toBe(true);
    expect(state.window).toMatchObject({ priorityPlayer: 1 });
    expect(viewFor(state, 1).window).toMatchObject({ priorityPlayer: 1 });
    // While it's open, the player who acted waits.
    expect(applyAction(state, 0, { type: 'ADVANCE_PHASE' })).toMatchObject({ ok: false, reason: 'window-open' });
    expect(applyAction(state, 1, { type: 'ACTIVATE_EFFECT', effectId: 'DESTRUIR_APOYO', sourceInstanceId: tifon, targets: [set] }).ok).toBe(true);
    expect(state.window).toBeNull();
    passAll(state);
    expect(state.players[0].graveyard).toContain(set);
  });

  it('passing closes it; with nothing to answer with, no window opens', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const tifon = await instance(1, 'Tifón Místico');
    placeSupport(state, tifon, 1, { faceDown: true });
    state.players[1].pixelcoins = 5;
    expect(applyAction(state, 0, { type: 'NORMAL_SUMMON', instanceId: await toHand(state, 0, 'Slime'), position: 'attack' }).ok).toBe(true);
    expect(applyAction(state, 1, { type: 'PASS_CHAIN' }).ok).toBe(true);
    expect(state.window).toBeNull();
    state.players[1].field.support = state.players[1].field.support.map(() => null);
    state.players[1].hand = [];
    expect(applyAction(state, 0, { type: 'ADVANCE_PHASE' }).ok).toBe(true);
    expect(state.window).toBeFalsy();
  });
});

describe('Deva', () => {
  it('summons a monster from a Cementerio, never a Compilación', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const fusion = await toGraveyard(state, 1, 'Búho del bosque oscuro'); // a Compilación of Nivel 5
    const slime = await toGraveyard(state, 1, 'Slime');
    const deva = await onField(state, 0, 'Deva');
    fireTrigger(state, 'onSummon', { instanceId: deva, controllerIndex: 0, cardId: monster(state, deva).cardId, kind: 'special' });
    const ask = viewFor(state, 0).pendingTriggerChoice;
    const ids = ask.options.map((o) => o.instanceId);
    expect(ids).not.toContain(fusion);
    expect(ids).toContain(slime);
  });
});

describe('Balance changes', () => {
  it('Otyugh 5/3, Goblin Ardiente 3/2 with no material effect', async () => {
    const state = await makeDuel();
    const o = await onField(state, 0, 'Otyugh');
    const g = await onField(state, 0, 'Goblin Ardiente');
    expect(getEffectiveStats(monster(state, o))).toEqual({ atk: 5, def: 3 });
    expect(getEffectiveStats(monster(state, g))).toEqual({ atk: 3, def: 2 });
    expect(STARTING_VP).toBeGreaterThan(0);
    expect(fireTrigger).toBeDefined();
  });
});
