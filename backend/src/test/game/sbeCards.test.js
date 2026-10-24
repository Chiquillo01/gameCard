// SBE cards programmed from the final card list.
const { connectDB, disconnectDB } = require('../../mongo/connection');
const { applyAction, viewFor } = require('../../game/engine');
const { getEffectiveStats, recomputeContinuous, fireTrigger } = require('../../game/effectEngine');
const { placeSupport, placeMonster } = require('../../game/zones');
const { sendToGraveyard } = require('../../game/effects/fieldActions');
const { seedCatalog, makeDuel, instance, toHand, toDeckTop, toGraveyard, onField, toPhase, passAll, monster } = require('./engineHelpers');
const { placePending, actPicking } = require('./chainHelpers');

beforeAll(async () => {
  await connectDB();
  await seedCatalog();
});

afterAll(async () => {
  await disconnectDB();
});

// Answers the pending choices (whoever they belong to) with `picks`, then the first option.
const answer = (state, picks = []) => {
  let guard = 0;
  let sent = [];
  let asked = null;
  while (guard++ < 20) {
    const pending = state.pendingTriggerChoices && state.pendingTriggerChoices[0];
    if (!pending) return;
    if (pending.kind === 'slot') { applyAction(state, pending.controllerIndex, { type: 'RESOLVE_TRIGGER_CHOICE', slot: pending.slots[0] }); sent = []; continue; }
    const p = pending.controllerIndex;
    const view = asked || viewFor(state, p).pendingTriggerChoice;
    const next = picks.find((id) => view.options.some((o) => o.instanceId === id) && !sent.includes(id)) || view.options[0].instanceId;
    sent = [...sent, next];
    const res = applyAction(state, p, { type: 'RESOLVE_TRIGGER_CHOICE', targets: sent });
    asked = res.reason === 'choose-target' ? res : null;
    if (res.reason !== 'choose-target') { sent = []; passAll(state); }
  }
};
const fusionOnField = async (state, p, name) => {
  const id = await instance(p, name);
  placeMonster(state, id, p, { position: 'attack' });
  return id;
};
const atk = (state, id) => getEffectiveStats(monster(state, id)).atk;
const def = (state, id) => getEffectiveStats(monster(state, id)).def;
const effect = (state, p, effectId, source, targets) => applyAction(state, p, { type: 'ACTIVATE_EFFECT', effectId, sourceInstanceId: source, ...(targets ? { targets } : {}) });
const destroy = (state, by, p, id) => sendToGraveyard({ state, controllerIndex: by, sourceInstanceId: null }, { entry: monster(state, id), ownerIndex: p });

describe('Hada del Bosque Oscuro and the cards that need her', () => {
  it('other "Bosque Oscuro" monsters +2 Atk; Nuberu and Busgosu can be special summoned only while she is on the field', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const nuberu = await toHand(state, 0, 'Nuberu del Bosque Oscuro');
    expect(applyAction(state, 0, { type: 'SPECIAL_SUMMON', instanceId: nuberu }).ok).toBe(false);
    await onField(state, 1, 'Hada del Bosque Oscuro'); // the rival's doesn't count
    expect(applyAction(state, 0, { type: 'SPECIAL_SUMMON', instanceId: nuberu }).ok).toBe(false);
    const hada = await onField(state, 0, 'Hada del Bosque Oscuro');
    expect(applyAction(state, 0, { type: 'SPECIAL_SUMMON', instanceId: nuberu }).ok).toBe(true);
    placePending(state);
    recomputeContinuous(state);
    expect(atk(state, nuberu)).toBe(3 + 2 + 2); // both Hadas buff every "Bosque Oscuro" on the field
    expect(atk(state, hada)).toBe(12 + 2);
  });

  it('when an Hada of its controller leaves the field: draw 1 and 2 Píxel, twice per turn at most; rival Hadas do not count', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    await onField(state, 0, 'Hada del Bosque Oscuro');
    const pl = state.players[0];
    const [h, px] = [pl.hand.length, pl.pixelcoins];
    const theirs = await onField(state, 1, 'Xana del Bosque Oscuro');
    destroy(state, 0, 1, theirs);
    recomputeContinuous(state);
    expect(pl.hand.length).toBe(h);
    for (let i = 0; i < 3; i++) {
      const xana = await onField(state, 0, 'Xana del Bosque Oscuro'); // an Hada
      destroy(state, 1, 0, xana);
      recomputeContinuous(state);
    }
    expect(pl.hand.length).toBe(h + 2);
    expect(pl.pixelcoins).toBe(px + 4);
  });

  it('when its player adds an Hada monster from the Mazo to the hand, destroys a monster and gains VP equal to its Atk', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    await onField(state, 0, 'Hada del Bosque Oscuro');
    const kraken = await onField(state, 1, 'Kraken');
    const krakenAtk = atk(state, kraken);
    const atalaya = await toDeckTop(state, 0, 'Atalaya del Bosque Oscuro'); // Hada
    const busgosu = await onField(state, 0, 'Busgosu del Bosque Oscuro');
    await toDeckTop(state, 0, 'Pantano del Bosque Oscuro');
    const vp = state.players[0].vp;
    // Sabio's search from the Mazo finds the Atalaya (Hada).
    const sabio = await fusionOnField(state, 0, 'Sabio del Bosque Oscuro');
    fireTrigger(state, 'onSummon', { instanceId: sabio, controllerIndex: 0, cardId: monster(state, sabio).cardId, kind: 'special' });
    answer(state, [atalaya, kraken]);
    expect(state.players[0].hand).toContain(atalaya);
    expect(monster(state, kraken)).toBeUndefined();
    expect(state.players[0].vp).toBe(vp + krakenAtk);
    expect(busgosu).toBeDefined();
  });
});

describe('El Bosque Oscuro', () => {
  it('on play: a "Bosque Oscuro" monster from the Mazo or Cementerio, then a discard; +2/+2 to them; Píxel at the end with the Hada', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const cuelebre = await toGraveyard(state, 0, 'Cuélebre del Bosque Oscuro');
    const bosque = await toHand(state, 0, 'El Bosque Oscuro');
    const filler = await toHand(state, 0, 'Slime');
    state.players[0].pixelcoins = 10;
    expect(actPicking(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: bosque }).ok).toBe(true);
    passAll(state);
    // The search (only the Cuélebre fits), then which card to discard.
    answer(state, [filler]);
    expect(state.players[0].hand).toContain(cuelebre);
    expect(state.players[0].field.territory).toMatchObject({ instanceId: bosque });
    expect(effect(state, 0, 'EL_BOSQUE_OSCURO_ON_PLAY', bosque).ok).toBe(false);
    const xana = await onField(state, 0, 'Xana del Bosque Oscuro');
    recomputeContinuous(state);
    expect(atk(state, xana)).toBe(2 + 2);
    expect(def(state, xana)).toBe(3 + 2);
    // Its destroy needs the Hada.
    const kraken = await onField(state, 1, 'Kraken');
    expect(effect(state, 0, 'EL_BOSQUE_OSCURO_DESTROY', bosque, [kraken]).ok).toBe(false);
    await onField(state, 0, 'Hada del Bosque Oscuro');
    expect(effect(state, 0, 'EL_BOSQUE_OSCURO_DESTROY', bosque, [kraken]).ok).toBe(true);
    passAll(state);
    expect(monster(state, kraken)).toBeUndefined();
    const px = state.players[0].pixelcoins;
    fireTrigger(state, 'phase', { timing: 'endPhase' });
    expect(state.players[0].pixelcoins).toBe(px + 1);
  });
});

describe('Cuélebre / Nuberu / Xana / Atalaya / Busgosu', () => {
  it('Cuélebre, sent to the Cementerio, summons a "Bosque Oscuro" from the hand; Nuberu, one from the Cementerio', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const cuelebre = await onField(state, 0, 'Cuélebre del Bosque Oscuro');
    const xana = await toHand(state, 0, 'Xana del Bosque Oscuro');
    destroy(state, 1, 0, cuelebre);
    answer(state);
    expect(monster(state, xana)).toBeDefined();
    const nuberu = await onField(state, 0, 'Nuberu del Bosque Oscuro');
    destroy(state, 1, 0, nuberu);
    answer(state, [cuelebre]);
    expect(monster(state, cuelebre)).toBeDefined();
  });

  it('Xana sends a "Bosque Oscuro" from the Mazo to the Cementerio; with the Hada, turns a face-up monster face-down', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const target = await toDeckTop(state, 0, 'Cuélebre del Bosque Oscuro');
    const xana = await toHand(state, 0, 'Xana del Bosque Oscuro');
    expect(applyAction(state, 0, { type: 'NORMAL_SUMMON', instanceId: xana, position: 'attack' }).ok).toBe(true);
    answer(state, [target]);
    expect(state.players[0].graveyard).toContain(target);
    const kraken = await onField(state, 1, 'Kraken');
    await onField(state, 0, 'Hada del Bosque Oscuro');
    expect(effect(state, 0, 'XANA_BO_QUICK_FLIP', xana, [kraken]).ok).toBe(true);
    passAll(state);
    expect(monster(state, kraken)).toMatchObject({ position: 'defense', faceDown: true });
  });

  it('Busgosu searches a "Bosque Oscuro" Soporte once per turn', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const busgosu = await onField(state, 0, 'Busgosu del Bosque Oscuro');
    const pantano = await toDeckTop(state, 0, 'Pantano del Bosque Oscuro');
    expect(effect(state, 0, 'BUSGOSU_BO_SEARCH', busgosu, [pantano]).ok).toBe(true);
    passAll(state);
    answer(state, [pantano]);
    expect(state.players[0].hand).toContain(pantano);
    expect(effect(state, 0, 'BUSGOSU_BO_SEARCH', busgosu).ok).toBe(false);
  });

  it('Atalaya, with the Hada, compiles a "Bosque Oscuro" with materials from the hand', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const atalaya = await onField(state, 0, 'Atalaya del Bosque Oscuro');
    await onField(state, 0, 'Hada del Bosque Oscuro');
    const buho = await instance(0, 'Búho del bosque oscuro');
    state.players[0].extra.push(buho);
    const m = await toHand(state, 0, 'Cuélebre del Bosque Oscuro');
    expect(effect(state, 0, 'ATALAYA_BO_QUICK_COMPILE', atalaya, [buho]).ok).toBe(true);
    passAll(state);
    answer(state);
    expect(monster(state, buho)).toBeDefined();
    expect(monster(state, buho).materials.length).toBe(2);
    expect(m).toBeDefined();
  });
});

describe('Búho / Sabio / Guardián', () => {
  it('Búho, exiled from the Cementerio, returns up to 3 "Bosque Oscuro" to the Mazo', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const buho = await toGraveyard(state, 0, 'Búho del bosque oscuro');
    const a = await toGraveyard(state, 0, 'Cuélebre del Bosque Oscuro');
    const b = await toGraveyard(state, 0, 'Xana del Bosque Oscuro');
    expect(effect(state, 0, 'BUHO_BO_GY_RETURN', buho, [a, b, 'done:0']).ok).toBe(true);
    passAll(state);
    expect(state.players[0].banished).toContain(buho);
    expect(state.players[0].deck).toEqual(expect.arrayContaining([a, b]));
  });

  it('Guardián sends up to 2 "Bosque Oscuro" from the Mazo / Mazo-C and gets 1 Píxel each; destroys a card of its own field', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const guardian = await fusionOnField(state, 0, 'Guardián del Bosque Oscuro');
    const a = await toDeckTop(state, 0, 'Xana del Bosque Oscuro');
    const sabio = await instance(0, 'Sabio del Bosque Oscuro');
    state.players[0].extra.push(sabio);
    const px = state.players[0].pixelcoins;
    fireTrigger(state, 'onSummon', { instanceId: guardian, controllerIndex: 0, cardId: monster(state, guardian).cardId, kind: 'special' });
    answer(state, [a, sabio]);
    expect(state.players[0].graveyard).toEqual(expect.arrayContaining([a, sabio]));
    expect(state.players[0].pixelcoins).toBe(px + 2);
    const mine = await onField(state, 0, 'Slime');
    expect(effect(state, 0, 'GUARDIAN_BO_DESTROY', guardian, [mine]).ok).toBe(true);
    passAll(state);
    expect(monster(state, mine)).toBeUndefined();
  });
});

describe('Pantano / Pétalos de Rosa / Raíz Centenaria', () => {
  it('Pantano shuffles a "Bosque Oscuro" from the Exilio into the Mazo and draws', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const pantano = await instance(0, 'Pantano del Bosque Oscuro');
    placeSupport(state, pantano, 0, { faceDown: false });
    const xana = await instance(0, 'Xana del Bosque Oscuro');
    state.players[0].banished.push(xana);
    const hand = state.players[0].hand.length;
    expect(effect(state, 0, 'PANTANO_BO_RECYCLE', pantano, [xana]).ok).toBe(true);
    passAll(state);
    expect(state.players[0].banished).not.toContain(xana);
    expect(state.players[0].hand.length).toBe(hand + 1);
  });

  it('Pétalos de Rosa: a petal per rival summon, +1 Atk each to the equipped monster; Raíz Centenaria: +1 Vida per root', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const ent = await onField(state, 0, 'Ent');
    const petalos = await toHand(state, 0, 'Pétalos de Rosa');
    const raiz = await toHand(state, 0, 'Raíz Centenaria');
    state.players[0].pixelcoins = 10;
    expect(applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: petalos }).ok).toBe(true);
    passAll(state);
    expect(applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: raiz }).ok).toBe(true);
    passAll(state);
    const [a0, d0] = [atk(state, ent), def(state, ent)];
    toPhase(state, 'main1', 1);
    expect(applyAction(state, 1, { type: 'NORMAL_SUMMON', instanceId: await toHand(state, 1, 'Slime'), position: 'attack' }).ok).toBe(true);
    answer(state);
    recomputeContinuous(state);
    expect(atk(state, ent)).toBe(a0 + 1);
    expect(def(state, ent)).toBe(d0 + 1);
  });
});

describe('Raiz Asfixiante', () => {
  it('equipped to a rival monster: it can\'t attack nor activate its effects', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const ent = await onField(state, 1, 'Ent');
    const raiz = await toHand(state, 0, 'Raiz Asfixiante');
    state.players[0].pixelcoins = 10;
    expect(applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: raiz, targets: [ent] }).ok).toBe(true);
    passAll(state);
    toPhase(state, 'main1', 1);
    expect(effect(state, 1, 'ENT_SEARCH_PLANTA', ent).ok).toBe(false);
    toPhase(state, 'battle', 1);
    expect(applyAction(state, 1, { type: 'DECLARE_ATTACK', attackerInstanceId: ent, targetInstanceId: null })).toMatchObject({ ok: false });
  });
});

describe('Extensor de Vida / El poder de las plantas', () => {
  it('Extensor de Vida: +30 VP; from the Cementerio, +30 more only while the rival has more VP', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const card = await toHand(state, 0, 'Extensor de Vida');
    state.players[0].pixelcoins = 10;
    const vp = state.players[0].vp;
    expect(applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: card }).ok).toBe(true);
    passAll(state);
    expect(state.players[0].vp).toBe(vp + 30);
    state.graveyardTurn = {};
    expect(effect(state, 0, 'EXTENSOR_VIDA_GY', card).ok).toBe(false);
    state.players[1].vp = state.players[0].vp + 1;
    expect(effect(state, 0, 'EXTENSOR_VIDA_GY', card).ok).toBe(true);
    passAll(state);
    expect(state.players[0].vp).toBe(vp + 60);
  });

  it('El poder de las plantas: sacrifice a Planta, 1 Píxel per its level', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const ent = await onField(state, 0, 'Ent'); // Nivel 5
    const card = await toHand(state, 0, 'El poder de las plantas');
    const px = state.players[0].pixelcoins;
    expect(applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: card, targets: [ent] }).ok).toBe(true);
    passAll(state);
    expect(state.players[0].graveyard).toContain(ent);
    expect(state.players[0].pixelcoins).toBe(px + 5);
  });
});

describe('Otyugh / Tarasca', () => {
  it('Otyugh: at the end of the turn every monster loses 2 Vida for good; one left at 0 is destroyed', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const otyugh = await onField(state, 0, 'Otyugh'); // Vida 3
    const ent = await onField(state, 1, 'Ent'); // Vida 5
    fireTrigger(state, 'phase', { timing: 'endPhase' });
    recomputeContinuous(state);
    expect(def(state, ent)).toBe(3);
    expect(def(state, otyugh)).toBe(1);
    fireTrigger(state, 'phase', { timing: 'endPhase' });
    recomputeContinuous(state);
    expect(def(state, ent)).toBe(1);
    expect(monster(state, otyugh)).toBeUndefined(); // 1 - 2: at 0, destroyed
  });

  it('Tarasca destroys every monster with less Atk and gains 2 Atk per one, for good', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const tarasca = await fusionOnField(state, 0, 'Tarasca, el Titán del Reino');
    const a = await onField(state, 1, 'Slime');
    const b = await onField(state, 0, 'Ent');
    const strong = await onField(state, 1, 'Hada del Bosque Oscuro'); // Atk 12
    const base = atk(state, tarasca);
    expect(effect(state, 0, 'TARASCA_DESTROY_WEAKER', tarasca).ok).toBe(true);
    passAll(state);
    recomputeContinuous(state);
    expect(monster(state, a)).toBeUndefined();
    expect(monster(state, b)).toBeUndefined();
    expect(monster(state, strong)).toBeDefined();
    expect(atk(state, tarasca)).toBe(base + 4);
  });
});
