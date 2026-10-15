// The four test Avispas (SBE): their effects work, and they can't be got from a chest or the Market.
const { connectDB, disconnectDB } = require('../../mongo/connection');
const { applyAction, viewFor } = require('../../game/engine');
const { recomputeContinuous } = require('../../game/effectEngine');
const { placeSupport } = require('../../game/zones');
const { getCard } = require('../../game/cardIndex');
const { seedCatalog, makeDuel, instance, toHand, toDeckTop, toGraveyard, onField, toPhase, passAll, monster, idOf } = require('./engineHelpers');
const { placePending } = require('./chainHelpers');

beforeAll(async () => {
  await connectDB();
  await seedCatalog();
});

afterAll(async () => {
  await disconnectDB();
});

const atkOf = (state, viewer, id) => viewFor(state, viewer).players.flatMap((p) => p.field.monsters).find((m) => m && m.instanceId === id).atk;
const printedAtk = async (name) => getCard(await idOf(name)).atk;
const act = (state, p, effectId, sourceInstanceId, targets = []) => applyAction(state, p, { type: 'ACTIVATE_EFFECT', effectId, sourceInstanceId, targets });

describe('Avispa Reina', () => {
  it('+4 Atk to every "Avispa" on the field; a Miel counter each time an Avispa effect is activated', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const reina = await onField(state, 0, 'Avispa Reina');
    const batalla = await onField(state, 0, 'Avispa de Batalla');
    const rival = await onField(state, 1, 'Avispa gigante');
    const orco = await onField(state, 1, 'Orco Guerrero');
    recomputeContinuous(state);
    expect(atkOf(state, 0, batalla)).toBe((await printedAtk('Avispa de Batalla')) + 4);
    expect(atkOf(state, 0, rival)).toBe((await printedAtk('Avispa gigante')) + 4);
    expect(atkOf(state, 0, orco)).toBe(await printedAtk('Orco Guerrero'));

    expect(act(state, 0, 'AVISPA_BATALLA_ZERO_ATK', batalla, [orco]).ok).toBe(true);
    passAll(state);
    expect(monster(state, reina).counters.Miel).toBe(1);
  });

  it('spends 2/4/6 Miel for its effects, only one of them a turn', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const reina = await onField(state, 0, 'Avispa Reina');
    monster(state, reina).counters = { Miel: 7 };
    const nido = await toGraveyard(state, 0, 'Nido de Avispas');
    const victim = await onField(state, 1, 'Orco Guerrero');

    expect(act(state, 0, 'AVISPA_REINA_NIDO', reina).ok).toBe(true);
    passAll(state);
    expect(state.players[0].hand).toContain(nido);
    expect(monster(state, reina).counters.Miel).toBe(5);
    // Once a turn, whichever of the three.
    expect(act(state, 0, 'AVISPA_REINA_EXILE', reina, [victim])).toMatchObject({ ok: false });

    toPhase(state, 'main1', 1);
    toPhase(state, 'main1', 0); // a new turn of the player
    expect(act(state, 0, 'AVISPA_REINA_DESTROY', reina, [victim])).toMatchObject({ ok: false, reason: 'cannot-pay-cost' }); // 5 < 6
    expect(act(state, 0, 'AVISPA_REINA_EXILE', reina, [victim]).ok).toBe(true);
    passAll(state);
    expect(state.players[1].banished).toContain(victim);
    // "Hasta el final del siguiente turno": still exiled after this turn's Fase Final...
    toPhase(state, 'main1', 1);
    expect(state.players[1].banished).toContain(victim);
    // ...and back at the end of the next one.
    toPhase(state, 'main1', 0);
    expect(monster(state, victim)).toBeDefined();
  });
});

describe('Avispa Arquera', () => {
  it('+1 Atk/Vida per "Avispa" in the Cementerio; when summoned, sends an "Avispa" from the Mazo there', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const arquera = await instance(0, 'Avispa Arquera');
    state.players[0].extra.push(arquera);
    const a = await onField(state, 0, 'Avispa gigante');
    const b = await onField(state, 0, 'Avispa Rosa');
    const fromDeck = await toDeckTop(state, 0, 'Avispa Mutante');
    expect(applyAction(state, 0, { type: 'COMPILE_SUMMON', instanceId: arquera, materials: [a, b], materialInstanceIds: [a, b] }).ok).toBe(true);
    placePending(state);
    expect(state.players[0].graveyard).toContain(fromDeck);
    const inGrave = state.players[0].graveyard.filter((id) => getCard(id.split(':')[1]).name.includes('Avispa')).length;
    expect(atkOf(state, 0, arquera)).toBe((await printedAtk('Avispa Arquera')) + inGrave);
  });
});

describe('Avispa de Respaldo', () => {
  it('special summon with 2 "Avispa"; as a quick effect it compiles a Himenóptero from the Mazo-C, which gets +1/+1 from it', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const respaldo = await toHand(state, 0, 'Avispa de Respaldo');
    expect(applyAction(state, 0, { type: 'SPECIAL_SUMMON', instanceId: respaldo })).toMatchObject({ ok: false, reason: 'special-summon-condition-not-met' });
    const other = await onField(state, 0, 'Avispa gigante');
    await onField(state, 0, 'Orco Guerrero');
    expect(applyAction(state, 0, { type: 'SPECIAL_SUMMON', instanceId: respaldo })).toMatchObject({ ok: false });
    const rosa = await onField(state, 0, 'Avispa Rosa');
    expect(applyAction(state, 0, { type: 'SPECIAL_SUMMON', instanceId: respaldo }).ok).toBe(true);
    placePending(state);
    require('../../game/zones').moveToZone(state, rosa, 'graveyard'); // Respaldo + Avispa gigante: the only materials left

    const arquera = await instance(0, 'Avispa Arquera');
    state.players[0].extra.push(arquera);
    expect(act(state, 0, 'AVISPA_RESPALDO_COMPILE', respaldo).ok).toBe(true);
    passAll(state);
    placePending(state);
    const compiled = monster(state, arquera);
    expect(compiled).toBeDefined();
    expect(compiled.materials).toHaveLength(2);
    // Respaldo was one of its materials: +1/+1 to the Compilación Insecto.
    expect(compiled.materials).toEqual(expect.arrayContaining([respaldo, other]));
    expect(compiled.permanentMods).toEqual(expect.arrayContaining([expect.objectContaining({ atk: 1, def: 1 })]));
    expect(act(state, 0, 'AVISPA_RESPALDO_COMPILE', other)).toMatchObject({ ok: false });
  });
});

describe('Avispa de Batalla', () => {
  it('special summon with no monsters of your own; with another Avispa, a rival monster\'s Atk is 0 until the end of the turn', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const batalla = await toHand(state, 0, 'Avispa de Batalla');
    expect(applyAction(state, 0, { type: 'SPECIAL_SUMMON', instanceId: batalla }).ok).toBe(true);
    placePending(state);
    const orco = await onField(state, 1, 'Orco Guerrero');
    expect(act(state, 0, 'AVISPA_BATALLA_ZERO_ATK', batalla, [orco])).toMatchObject({ ok: false, reason: 'conditions-not-met' }); // no other Avispa
    await onField(state, 0, 'Avispa Rosa');
    expect(act(state, 0, 'AVISPA_BATALLA_ZERO_ATK', batalla, [orco]).ok).toBe(true);
    passAll(state);
    expect(atkOf(state, 0, orco)).toBe(0);
    toPhase(state, 'main1', 1);
    expect(atkOf(state, 0, orco)).toBe(await printedAtk('Orco Guerrero'));
  });
});

describe('Cards that cannot be obtained', () => {
  it('no chest drops them and the Market refuses them', async () => {
    const { Card } = require('../../data/Schema/card');
    const { drawChest } = require('../../services/storeRewards');
    const { createListing } = require('../../services/market');
    const reina = await Card.findOne({ name: 'Avispa Reina' }).lean();
    expect(reina.obtainable).toBe(false);
    const table = [{ count: 20, odds: { common: 1, rare: 1, epic: 1, legendary: 1 } }];
    const drawn = await drawChest({ expansion: reina.expansion, dropTable: table });
    expect(drawn.length).toBe(20);
    expect(drawn.filter((c) => c.obtainable === false)).toEqual([]);
    await expect(createListing('64b000000000000000000001', { cardId: reina._id, amount: 1, price: 5 })).rejects.toMatchObject({ status: 400 });
  });
});
