// EdC cards programmed from the final card list, plus the fixes to the ones that had an effect.
const { connectDB, disconnectDB } = require('../../mongo/connection');
const { applyAction, viewFor } = require('../../game/engine');
const { fireTrigger, recomputeContinuous } = require('../../game/effectEngine');
const { placeSupport } = require('../../game/zones');
const { hasStatus } = require('../../game/statuses');
const { sendToGraveyard } = require('../../game/effects/fieldActions');
const { seedCatalog, makeDuel, instance, toHand, toDeckTop, toGraveyard, onField, toPhase, passAll, monster } = require('./engineHelpers');
const { placePending } = require('./chainHelpers');

beforeAll(async () => {
  await connectDB();
  await seedCatalog();
});

afterAll(async () => {
  await disconnectDB();
});

// Answers every pending choice (of either player) with the option `pick` prefers (or the first),
// resending the picks so far while the same choice still asks for more.
const resolveChoices = (state, pick = () => null) => {
  let guard = 0;
  let picks = [];
  let ask = null;
  while (guard++ < 20) {
    const pending = state.pendingTriggerChoices && state.pendingTriggerChoices[0];
    if (!pending) break;
    if (pending.kind === 'slot') { placePending(state); picks = []; ask = null; continue; }
    const p = pending.controllerIndex;
    const view = ask || viewFor(state, p).pendingTriggerChoice;
    picks.push(pick(view) || view.options[0].instanceId);
    const res = applyAction(state, p, { type: 'RESOLVE_TRIGGER_CHOICE', targets: picks });
    if (res.reason === 'choose-target') { ask = res; continue; }
    picks = [];
    ask = null;
    passAll(state);
  }
};
const fieldEntry = (state, p, id) => state.players[p].field.monsters.find((m) => m && m.instanceId === id);
// Destroys a monster with the effect of `sourceId` (null: no card).
const destroyBy = (state, by, p, id, sourceId = null) => sendToGraveyard({ state, controllerIndex: by, sourceInstanceId: sourceId }, { entry: fieldEntry(state, p, id), ownerIndex: p });

describe('Beholder', () => {
  it('can only be summoned while its controller has a Demonio', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const beholder = await toHand(state, 0, 'Beholder');
    expect(applyAction(state, 0, { type: 'NORMAL_SUMMON', instanceId: beholder })).toMatchObject({ ok: false, reason: 'summon-requirement' });
    await onField(state, 0, 'Rey Demonio');
    expect(applyAction(state, 0, { type: 'NORMAL_SUMMON', instanceId: beholder }).ok).toBe(true);
  });

  it('the rival picks the penalty — sacrifice, exile from the Cementerio or discard — and the card', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    await onField(state, 0, 'Rey Demonio');
    const a = await onField(state, 1, 'Slime');
    const b = await onField(state, 1, 'Kraken');
    await toGraveyard(state, 1, 'Slime');
    state.players[1].hand = [];
    await toHand(state, 1, 'Slime');
    const beholder = await toHand(state, 0, 'Beholder');
    expect(applyAction(state, 0, { type: 'NORMAL_SUMMON', instanceId: beholder }).ok).toBe(true);
    const pending = viewFor(state, 1).pendingTriggerChoice;
    expect(pending.options.map((o) => o.name)).toEqual(['Sacrifica 1 monstruo que controles.', 'Exilia 1 carta de tu Cementerio.', 'Descarta 1 carta de tu Mano.']);
    expect(viewFor(state, 0).pendingTriggerChoice).toBeNull();
    expect(applyAction(state, 1, { type: 'RESOLVE_TRIGGER_CHOICE', targets: ['choice:0'] }).ok).toBe(true);
    expect(viewFor(state, 1).pendingTriggerChoice.options.map((o) => o.instanceId).sort()).toEqual([a, b].sort());
    expect(applyAction(state, 1, { type: 'RESOLVE_TRIGGER_CHOICE', targets: [b] }).ok).toBe(true);
    expect(state.players[1].graveyard).toContain(b);
    expect(monster(state, a)).toBeDefined();
  });

  it('with only one penalty possible, it just happens', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    await onField(state, 0, 'Rey Demonio');
    state.players[1].hand = [];
    const only = await toHand(state, 1, 'Slime');
    const beholder = await toHand(state, 0, 'Beholder');
    expect(applyAction(state, 0, { type: 'NORMAL_SUMMON', instanceId: beholder }).ok).toBe(true);
    expect(state.players[1].graveyard).toContain(only);
  });
});

describe('Herida Sangrante', () => {
  it('destroys a monster and its player recovers VP equal to its Atk', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const kraken = await onField(state, 1, 'Kraken');
    const atk = require('../../game/effectEngine').getEffectiveStats(monster(state, kraken)).atk;
    const card = await toHand(state, 0, 'Herida Sangrante');
    state.players[0].pixelcoins = 10;
    const vp = state.players[0].vp;
    expect(applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: card, targets: [kraken] }).ok).toBe(true);
    passAll(state);
    expect(monster(state, kraken)).toBeUndefined();
    expect(state.players[0].vp).toBe(vp + atk);
  });
});

describe('Caballo de Paja', () => {
  it('gives the rival a 0/0 Planta monster', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const card = await toHand(state, 0, 'Caballo de Paja');
    state.players[0].pixelcoins = 5;
    expect(applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: card }).ok).toBe(true);
    passAll(state);
    resolveChoices(state);
    const horse = state.players[1].field.monsters.find((m) => m && m.isToken);
    expect(horse).toMatchObject({ tokenDef: { name: 'Caballo de Paja', breed: 'Planta', level: 2 }, baseAtk: 0, baseDef: 0 });
    expect(state.players[0].field.monsters.some((m) => m && m.isToken)).toBe(false);
  });
});

describe('Cáliz de Sangre', () => {
  it('searches an Inmortal; from the Cementerio (not the turn it got there) +5 VP per Inmortal', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const vampiro = await toDeckTop(state, 0, 'Vampiro');
    const caliz = await toHand(state, 0, 'Cáliz de Sangre');
    state.players[0].vp = 60;
    expect(applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: caliz }).ok).toBe(true);
    passAll(state);
    resolveChoices(state, (p) => (p.options.find((o) => o.instanceId === vampiro) || {}).instanceId);
    expect(state.players[0].hand).toContain(vampiro);
    expect(state.players[0].graveyard).toContain(caliz);

    const gy = () => applyAction(state, 0, { type: 'ACTIVATE_EFFECT', effectId: 'CALIZ_SANGRE_GY_VP', sourceInstanceId: caliz });
    expect(gy().ok).toBe(false);
    state.graveyardTurn[caliz] = state.turnNumber - 1;
    await onField(state, 0, 'Vampiro');
    await onField(state, 0, 'Vampiresa');
    const vp = state.players[0].vp;
    expect(gy().ok).toBe(true);
    passAll(state);
    expect(state.players[0].vp).toBe(vp + 10);
    expect(state.players[0].banished).toContain(caliz);
  });
});

describe('Héroe Frío Polar', () => {
  it('sent from the Campo to the Cementerio, freezes a monster', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const polar = await instance(0, 'Héroe Frío Polar');
    require('../../game/zones').placeMonster(state, polar, 0, { position: 'attack' });
    const kraken = await onField(state, 1, 'Kraken');
    destroyBy(state, 1, 0, polar);
    resolveChoices(state);
    expect(hasStatus(state, kraken, 'Congelado')).toBe(true);
  });
});

describe('Venganza de los Héroes', () => {
  it('answers a rival\'s effect by compiling a Héroe with materials from the Cementerio and the Exilio', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 1);
    const venganza = await instance(0, 'Venganza de los Héroes');
    placeSupport(state, venganza, 0, { faceDown: true });
    state.players[0].field.support.find((s) => s && s.instanceId === venganza).setTurn = state.turnNumber - 1;
    state.players[0].pixelcoins = 5;
    const berserker = await instance(0, 'Héroe Berserker');
    state.players[0].extra.push(berserker);
    const m1 = await toGraveyard(state, 0, 'Héroe Silencioso');
    const m2 = await instance(0, 'Héroe Montado');
    state.players[0].banished.push(m2);
    const caballo = await toHand(state, 1, 'Caballo de Paja');
    state.players[1].pixelcoins = 5;
    expect(applyAction(state, 1, { type: 'ACTIVATE_SUPPORT', instanceId: caballo }).ok).toBe(true);
    expect(applyAction(state, 0, { type: 'ACTIVATE_EFFECT', effectId: 'VENGANZA_HEROES_COMPILE', sourceInstanceId: venganza }).ok).toBe(true);
    passAll(state);
    resolveChoices(state);
    expect(monster(state, berserker)).toBeDefined();
    expect(monster(state, berserker).materials.sort()).toEqual([m1, m2].sort());
  });
});

describe('Noche Eterna', () => {
  it('recovers VP equal to the Atk of a monster destroyed by an Inmortal\'s effect, not by others', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    placeSupport(state, await instance(0, 'Noche Eterna'), 0, { faceDown: false });
    const vampiro = await onField(state, 0, 'Vampiro');
    const kraken = await onField(state, 1, 'Kraken');
    const slime = await onField(state, 1, 'Slime');
    const reyDemonio = await onField(state, 0, 'Rey Demonio');
    const atk = require('../../game/effectEngine').getEffectiveStats(monster(state, kraken)).atk;
    const vp = state.players[0].vp;
    destroyBy(state, 0, 1, slime, reyDemonio);
    expect(state.players[0].vp).toBe(vp);
    destroyBy(state, 0, 1, kraken, vampiro);
    expect(state.players[0].vp).toBe(vp + atk);
  });

  it('once per turn shuffles an Inmortal from the Cementerio or Exilio into the Mazo and draws', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const noche = await instance(0, 'Noche Eterna');
    placeSupport(state, noche, 0, { faceDown: false });
    const vampiro = await instance(0, 'Vampiro');
    state.players[0].banished.push(vampiro);
    const hand = state.players[0].hand.length;
    const use = () => applyAction(state, 0, { type: 'ACTIVATE_EFFECT', effectId: 'NOCHE_ETERNA_RECYCLE', sourceInstanceId: noche });
    expect(use().ok).toBe(true);
    passAll(state);
    expect(state.players[0].banished).not.toContain(vampiro);
    expect(state.players[0].hand.length).toBe(hand + 1);
    expect(use().ok).toBe(false);
  });
});

describe('Héroe del Viento', () => {
  it('destroys ONE Apoyo (not one per Héroe)', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    await onField(state, 0, 'Héroe Silencioso');
    const s1 = await instance(1, 'Herida Sangrante');
    const s2 = await instance(1, 'Caballo de Paja');
    placeSupport(state, s1, 1, { faceDown: true });
    placeSupport(state, s2, 1, { faceDown: true });
    const viento = await toHand(state, 0, 'Héroe del Viento');
    expect(applyAction(state, 0, { type: 'NORMAL_SUMMON', instanceId: viento }).ok).toBe(true);
    resolveChoices(state, (p) => (p.options.find((o) => o.instanceId === 'choice:0') || {}).instanceId);
    expect(state.players[1].field.support.filter(Boolean)).toHaveLength(1);
  });
});

describe('Héroe de Marfil', () => {
  it('searches a Contraefecto that mentions "Héroe"', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const marfil = await onField(state, 0, 'Héroe de Marfil');
    await toDeckTop(state, 0, 'Contraataque de Batalla');
    const venganza = await toDeckTop(state, 0, 'Venganza de los Héroes');
    let res = applyAction(state, 0, { type: 'ACTIVATE_EFFECT', effectId: 'HEROE_MARFIL_SEARCH_COUNTER', sourceInstanceId: marfil });
    if (res.reason === 'choose-target') res = applyAction(state, 0, { type: 'ACTIVATE_EFFECT', effectId: 'HEROE_MARFIL_SEARCH_COUNTER', sourceInstanceId: marfil, targets: [venganza] });
    expect(res.ok).toBe(true);
    passAll(state);
    resolveChoices(state);
    expect(state.players[0].hand).toContain(venganza);
  });
});

describe('Héroe de la Esperanza', () => {
  it('when another Héroe battles, destroys a card and generates 1 Píxel', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const esperanza = await instance(0, 'Héroe de la Esperanza');
    require('../../game/zones').placeMonster(state, esperanza, 0, { position: 'attack' });
    const heroe = await onField(state, 0, 'Héroe Silencioso');
    const kraken = await onField(state, 1, 'Kraken');
    const pixels = state.players[0].pixelcoins;
    fireTrigger(state, 'involvedInBattle', { attackerInstanceId: heroe, defenderInstanceId: kraken });
    resolveChoices(state, (p) => (p.options.find((o) => o.instanceId === kraken) || {}).instanceId);
    expect(monster(state, kraken)).toBeUndefined();
    expect(state.players[0].pixelcoins).toBe(pixels + 1);
  });
});

describe('Héroe Fénix', () => {
  it('sent to the Cementerio, destroys a card and comes back itself', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const fenix = await instance(0, 'Héroe Fénix');
    require('../../game/zones').placeMonster(state, fenix, 0, { position: 'attack' });
    const other = await toGraveyard(state, 0, 'Héroe Fénix');
    const kraken = await onField(state, 1, 'Kraken');
    destroyBy(state, 1, 0, fenix);
    resolveChoices(state);
    recomputeContinuous(state);
    expect(monster(state, kraken)).toBeUndefined();
    expect(monster(state, fenix)).toBeDefined();
    expect(state.players[0].graveyard).toContain(other);
  });
});
