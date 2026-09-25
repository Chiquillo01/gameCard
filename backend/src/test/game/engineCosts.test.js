// Costs and conditions: every cost the card data uses can actually be paid (and the player picks
// what pays it), an unknown cost or condition never lets an effect through, and nothing is spent
// when an activation can't go ahead.
const { connectDB, disconnectDB } = require('../../mongo/connection');
const { applyAction, viewFor } = require('../../game/engine');
const { payCost } = require('../../game/effects/costs');
const { checkConditions } = require('../../game/effects/conditions');
const { seedCatalog, makeDuel, toHand, toDeckTop, toGraveyard, onField, toPhase, passAll, monster } = require('./engineHelpers');

beforeAll(async () => {
  await connectDB();
  await seedCatalog();
});

afterAll(async () => {
  await disconnectDB();
});

describe('Unknown costs and conditions', () => {
  it('a cost the engine does not know cannot be paid (it is never free)', async () => {
    const state = await makeDuel();
    const ctx = { state, controllerIndex: 0, sourceInstanceId: null };
    expect(payCost(ctx, { fn: 'somethingNew', args: {} }, [])).toBe(false);
  });

  it('a condition the engine does not know is never met', async () => {
    const state = await makeDuel();
    expect(checkConditions({ state, controllerIndex: 0 }, [{ fn: 'somethingNew' }])).toBe(false);
  });
});

describe('Costs the data uses', () => {
  it('Dragón de Tierra Bebe: discards itself and the Dragón the player picks, then summons from the Mazo', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const bebe = await toHand(state, 0, 'Dragón de Tierra Bebe');
    const fire = await toHand(state, 0, 'Dragón de Fuego Bebe');
    const wind = await toHand(state, 0, 'Dragón de Viento Bebe');
    const roco = await toDeckTop(state, 0, 'Roco, el Dragón de Tierra');

    // Available from the hand (its cost discards it from there).
    const handCard = viewFor(state, 0).players[0].hand.find((c) => c.instanceId === bebe);
    expect(handCard.availableEffects).toContain('DRAGON_TIERRA_BEBE_SUMMON');

    const ask = applyAction(state, 0, { type: 'ACTIVATE_EFFECT', effectId: 'DRAGON_TIERRA_BEBE_SUMMON', sourceInstanceId: bebe });
    expect(ask).toMatchObject({ ok: false, reason: 'choose-target' });
    expect(ask.options.map((o) => o.instanceId).sort()).toEqual([fire, wind].sort());
    expect(state.players[0].hand).toContain(bebe); // nothing paid while asking

    expect(applyAction(state, 0, { type: 'ACTIVATE_EFFECT', effectId: 'DRAGON_TIERRA_BEBE_SUMMON', sourceInstanceId: bebe, targets: [wind] }).ok).toBe(true);
    expect(state.players[0].graveyard).toEqual(expect.arrayContaining([bebe, wind]));
    expect(state.players[0].hand).toContain(fire);
    passAll(state);
    expect(monster(state, roco)).toBeDefined();
  });

  it('Orco Gladiador: sacrifices the monster the player picks; an Orco also gives it +2 Atk, and it gets a second attack', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const gladiador = await onField(state, 0, 'Orco Gladiador');
    const guerrero = await onField(state, 0, 'Orco Guerrero');
    const slime = await onField(state, 0, 'Slime');

    const ask = applyAction(state, 0, { type: 'ACTIVATE_EFFECT', effectId: 'ORCO_GLADIADOR_EXTRA_ATTACK', sourceInstanceId: gladiador });
    expect(ask).toMatchObject({ reason: 'choose-target' });
    expect(ask.options.map((o) => o.instanceId).sort()).toEqual([guerrero, slime].sort());
    expect(applyAction(state, 0, { type: 'ACTIVATE_EFFECT', effectId: 'ORCO_GLADIADOR_EXTRA_ATTACK', sourceInstanceId: gladiador, targets: [guerrero] }).ok).toBe(true);
    passAll(state);
    expect(monster(state, guerrero)).toBeUndefined();
    expect(monster(state, gladiador).baseAtk).toBe(3 + 2);

    // Turn 1 has no Battle Phase: carry the bonus into a check of the attack budget.
    const { allowedAttacks } = require('../../game/combat');
    expect(allowedAttacks(state, monster(state, gladiador))).toBe(2);
  });

  it('Refuerzos: its graveyard effect waits a turn after it reaches the Cementerio, then exiles it as the cost', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const refuerzos = await toHand(state, 0, 'Refuerzos');
    await toGraveyard(state, 0, 'Slime');
    await toGraveyard(state, 0, 'Valkiria');
    // Played and resolved: it reaches the Cementerio this turn.
    applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: refuerzos });
    passAll(state);
    expect(state.players[0].graveyard).toContain(refuerzos);
    expect(applyAction(state, 0, { type: 'ACTIVATE_EFFECT', effectId: 'REFUERZOS_GY_SHUFFLE_DRAW', sourceInstanceId: refuerzos })).toMatchObject({ ok: false, reason: 'conditions-not-met' });

    toPhase(state, 'main1', 1);
    toPhase(state, 'main1', 0);
    const hand = state.players[0].hand.length;
    expect(applyAction(state, 0, { type: 'ACTIVATE_EFFECT', effectId: 'REFUERZOS_GY_SHUFFLE_DRAW', sourceInstanceId: refuerzos }).ok).toBe(true);
    expect(state.players[0].banished).toContain(refuerzos);
    passAll(state);
    expect(state.players[0].hand.length).toBe(hand + 1);
  });

  it('Perro Esqueleto: its "once per duel" revival works once, then never again', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const perro = await toGraveyard(state, 0, 'Perro Esqueleto');
    expect(applyAction(state, 0, { type: 'SPECIAL_SUMMON', instanceId: perro }).ok).toBe(true);
    const { moveToZone } = require('../../game/zones');
    moveToZone(state, perro, 'graveyard');
    expect(applyAction(state, 0, { type: 'SPECIAL_SUMMON', instanceId: perro })).toMatchObject({ ok: false, reason: 'special-summon-condition-not-met' });
  });

  it('Duérgar: +2 Atk only while the rival controls more monsters', async () => {
    const state = await makeDuel();
    const duergar = await onField(state, 0, 'Duérgar');
    const { recomputeContinuous } = require('../../game/effectEngine');
    recomputeContinuous(state);
    expect(monster(state, duergar).tempBuff.atk).toBe(0);
    await onField(state, 1, 'Slime');
    await onField(state, 1, 'Slime');
    recomputeContinuous(state);
    expect(monster(state, duergar).tempBuff.atk).toBe(2);
  });
});

describe('Nothing is paid when an activation cannot go ahead', () => {
  it('an Apoyo with no free support zone is refused before its pixel cost is taken', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const { placeSupport } = require('../../game/zones');
    for (let i = 0; i < 4; i++) placeSupport(state, await toHand(state, 0, 'Chispa'), 0, { faceDown: true });
    const olla = await toHand(state, 0, 'Olla de la Usura');
    const pixels = state.players[0].pixelcoins;
    expect(applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: olla })).toMatchObject({ ok: false, reason: 'no-field-space' });
    expect(state.players[0].pixelcoins).toBe(pixels);
    expect(state.players[0].hand).toContain(olla);
  });
});

describe('The player chooses', () => {
  it('discarding down to the hand limit at the end of the turn: the player picks which cards go', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const ids = [];
    for (let i = 0; i < 10; i++) ids.push(await toHand(state, 0, i % 2 ? 'Slime' : 'Chispa'));
    applyAction(state, 0, { type: 'ADVANCE_PHASE' }); // turn 1: straight to the End Phase
    expect(state.phase).toBe('end');
    const pending = viewFor(state, 0).pendingTriggerChoice;
    expect(pending).toMatchObject({ kind: 'discard', count: 2 });
    // The turn can't end until the discard is done.
    expect(applyAction(state, 0, { type: 'ADVANCE_PHASE' })).toMatchObject({ ok: false, reason: 'trigger-choice-pending' });
    const partial = applyAction(state, 0, { type: 'RESOLVE_TRIGGER_CHOICE', targets: [ids[3]] });
    expect(partial).toMatchObject({ ok: false, reason: 'choose-target' });
    expect(applyAction(state, 0, { type: 'RESOLVE_TRIGGER_CHOICE', targets: [ids[3], ids[7]] }).ok).toBe(true);
    expect(state.players[0].graveyard).toEqual(expect.arrayContaining([ids[3], ids[7]]));
    expect(state.players[0].hand).toHaveLength(8);
  });
});
