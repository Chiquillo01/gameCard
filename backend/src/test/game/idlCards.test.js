// IdL cards fixed after play-testing.
const { connectDB, disconnectDB } = require('../../mongo/connection');
const { applyAction, viewFor } = require('../../game/engine');
const { compileInfo } = require('../../game/compileInfo');
const { recomputeContinuous, getEffectiveStats } = require('../../game/effectEngine');
const { placeMonster, placeSupport } = require('../../game/zones');
const { isNegated } = require('../../game/negation');
const { seedCatalog, makeDuel, instance, toHand, toDeckTop, toGraveyard, onField, toPhase, passAll, monster } = require('./engineHelpers');
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

// Answers the pending choices of player `p` in order: `picks` (then the first option).
const answer = (state, p, picks) => {
  let guard = 0;
  while (guard++ < 10) {
    const pending = state.pendingTriggerChoices && state.pendingTriggerChoices[0];
    if (!pending) return;
    if (pending.kind === 'slot') { placePending(state); continue; }
    const view = viewFor(state, p).pendingTriggerChoice;
    const res = applyAction(state, p, { type: 'RESOLVE_TRIGGER_CHOICE', targets: picks.length ? picks : [view.options[0].instanceId] });
    if (res.reason === 'choose-target') picks = [...picks, res.options[0].instanceId];
    passAll(state);
  }
};

describe('Planetar', () => {
  it('on summon: sacrifices itself to summon an Hada from the Cementerio', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const deva = await toGraveyard(state, 0, 'Valkiria');
    const planetar = await toHand(state, 0, 'Planetar');
    expect(applyAction(state, 0, { type: 'NORMAL_SUMMON', instanceId: planetar }).ok).toBe(true);
    const pending = viewFor(state, 0).pendingTriggerChoice;
    expect(pending.options.map((o) => o.instanceId)).toEqual(['choice:0', 'choice:1', 'choice:skip']);
    answer(state, 0, ['choice:0']);
    expect(state.players[0].graveyard).toContain(planetar);
    expect(monster(state, deva)).toBeDefined();
  });

  it('on summon: or adds an Hada monster from the Mazo to the hand; it may also do nothing', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const valkiria = await toDeckTop(state, 0, 'Valkiria');
    const planetar = await toHand(state, 0, 'Planetar');
    expect(applyAction(state, 0, { type: 'NORMAL_SUMMON', instanceId: planetar }).ok).toBe(true);
    answer(state, 0, ['choice:1']);
    expect(state.players[0].hand).toContain(valkiria);
    expect(monster(state, planetar)).toBeDefined();
  });

  it('used as material for an Hada Compilación, draws 1 card', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const seraphine = await instance(0, 'Seraphine');
    state.players[0].extra.push(seraphine);
    const mats = [await onField(state, 0, 'Planetar'), await onField(state, 0, 'Deva'), await onField(state, 0, 'Valkiria')];
    const hand = state.players[0].hand.length;
    expect(applyAction(state, 0, { type: 'COMPILE_SUMMON', instanceId: seraphine, materialInstanceIds: mats }).ok).toBe(true);
    answer(state, 0, []);
    expect(state.players[0].hand.length).toBeGreaterThanOrEqual(hand + 1);
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
    expect(viewFor(state, 0).players[1].field.monsters.filter(Boolean).every((m) => m.negated)).toBe(true);
  });

  it('a recipe of monsters never takes an Apoyo: Avispa Arquera ("2 Avispa") ignores Nido de Avispas', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    placeSupport(state, await instance(0, 'Nido de Avispas'), 0, { faceDown: false });
    const arquera = await instance(0, 'Avispa Arquera');
    state.players[0].extra.push(arquera);
    const avispa = await onField(state, 0, 'Avispa Rosa');
    expect(compileInfo(state, 0, arquera).ready).toBe(false);
    const nido = state.players[0].field.support.find(Boolean).instanceId;
    expect(applyAction(state, 0, { type: 'COMPILE_SUMMON', instanceId: arquera, materialInstanceIds: [avispa, nido] }).ok).toBe(false);
  });
});
