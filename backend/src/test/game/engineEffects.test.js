// Negation (and how long it lasts), responding on the Pila, "uno de estos efectos" choices, player
// picks for "selecciona" effects, and the actions/flags that used to be ignored.
const { connectDB, disconnectDB } = require('../../mongo/connection');
const { applyAction, viewFor } = require('../../game/engine');
const { recomputeContinuous, fireTrigger } = require('../../game/effectEngine');
const { placeSupport, moveToZone, placeMonster } = require('../../game/zones');
const { isNegated } = require('../../game/negation');
const { matchesFilter, matchesCardFilter } = require('../../game/filters');
const { getCard, getEffect, effectCodesOf } = require('../../game/cardIndex');
const { registry } = require('../../game/effects/actions');
const { canAffect } = require('../../game/targets');
const effects = require('../../data/seed/effects_final.json');
const { seedCatalog, makeDuel, toHand, toDeckTop, onField, toPhase, passAll, monster, instance, idOf } = require('./engineHelpers');

beforeAll(async () => {
  await connectDB();
  await seedCatalog();
});

afterAll(async () => {
  await disconnectDB();
});

const activate = (state, p, effectId, source, targets) => applyAction(state, p, { type: 'ACTIVATE_EFFECT', effectId, sourceInstanceId: source, targets });

describe('Negation lasts as long as the card says', () => {
  it('Cubo Gelatinoso: the player picks the card; negated until the end of the turn', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const cubo = await onField(state, 0, 'Cubo Gelatinoso');
    const slime = await onField(state, 1, 'Slime');
    const pez = await onField(state, 1, 'Pez Leviatán');
    const ask = activate(state, 0, 'CUBO_GELATINOSO_NEGATE', cubo);
    expect(ask).toMatchObject({ ok: false, reason: 'choose-target', prompt: 'Elige la carta cuyos efectos se niegan' });
    expect(ask.options.map((o) => o.instanceId).sort()).toEqual([slime, pez].sort());
    expect(activate(state, 0, 'CUBO_GELATINOSO_NEGATE', cubo, [pez]).ok).toBe(true);
    passAll(state);
    expect(isNegated(state, monster(state, pez))).toBe(true);
    expect(isNegated(state, monster(state, slime))).toBe(false);
    toPhase(state, 'main1', 1);
    expect(isNegated(state, monster(state, pez))).toBe(false);
  });

  it('Fuegos Fatuos (Equipo): the monster is negated only while the card stays equipped', async () => {
    const state = await makeDuel();
    const slime = await onField(state, 1, 'Slime');
    const fuegosId = await instance(0, 'Fuegos Fatuos');
    const fuegos = placeSupport(state, fuegosId, 0, { faceDown: false });
    fuegos.equippedTo = slime;
    recomputeContinuous(state);
    expect(isNegated(state, monster(state, slime))).toBe(true);
    moveToZone(state, fuegosId, 'graveyard');
    recomputeContinuous(state);
    expect(isNegated(state, monster(state, slime))).toBe(false);
  });

  it('Seraphine: with no duration given it is permanent — until the negated card leaves the field', async () => {
    const state = await makeDuel();
    const dark = await onField(state, 1, 'Slime'); // Oscuridad
    const light = await onField(state, 1, 'Valkiria'); // Luz
    const seraphine = await onField(state, 0, 'Seraphine');
    fireTrigger(state, 'onSummon', { instanceId: seraphine, cardId: seraphine.split(':')[1], controllerIndex: 0 });
    expect(isNegated(state, monster(state, dark))).toBe(true);
    expect(isNegated(state, monster(state, light))).toBe(false);
    toPhase(state, 'main1', 1);
    expect(isNegated(state, monster(state, dark))).toBe(true);
    moveToZone(state, dark, 'hand');
    placeMonster(state, dark, 1, { position: 'attack' });
    expect(isNegated(state, monster(state, dark))).toBe(false);
  });
});

describe('Responding on the Pila', () => {
  it('Djinni negates the rival\'s card and sends it to the Cementerio — but only in answer to something', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const olla = await toHand(state, 0, 'Olla de la Usura');
    const djinni = await toHand(state, 1, 'Djinni');
    expect(applyAction(state, 1, { type: 'ACTIVATE_SUPPORT', instanceId: djinni })).toMatchObject({ ok: false });
    const hand = state.players[0].hand.length;
    expect(applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: olla }).ok).toBe(true);
    expect(applyAction(state, 1, { type: 'ACTIVATE_SUPPORT', instanceId: djinni }).ok).toBe(true);
    passAll(state);
    expect(state.players[0].hand.length).toBe(hand - 1); // Olla left the hand and drew nothing
    expect(state.players[0].graveyard).toContain(olla);
  });

  it('Kraken: from the hand, negates an effect that includes getting a card back from the Cementerio', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const kraken = await toHand(state, 1, 'Kraken');
    const source = await toHand(state, 0, 'Llamada al Héroe');
    // The rival's effect on the Pila: "Agrega a tu Mano un Héroe del Cementerio".
    state.chain.push({ controllerIndex: 0, sourceInstanceId: source, cardName: 'Llamada al Héroe', effects: [getEffect('LLAMADA_HEROE_GY_RECOVER')], targets: [], speed: 1, costPaid: [] });
    state.priorityPlayer = 1;
    const handCard = viewFor(state, 1).players[1].hand.find((c) => c.instanceId === kraken);
    expect(handCard.availableEffects).toContain('KRAKEN_NEGATE');
    expect(activate(state, 1, 'KRAKEN_NEGATE', kraken).ok).toBe(true);
    expect(state.players[1].graveyard).toContain(kraken);
    passAll(state);
    expect(state.chain).toHaveLength(0);
    expect(state.log.some((l) => l.message.includes('Se niega la activación de Llamada al Héroe'))).toBe(true);
  });

  it('Kraken cannot answer an effect that includes none of the things it lists', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const kraken = await toHand(state, 1, 'Kraken');
    state.chain.push({ controllerIndex: 0, sourceInstanceId: await toHand(state, 0, 'Olla de la Usura'), cardName: 'Olla', effects: [getEffect('OLLA_USURA_DRAW')], targets: [], speed: 1, costPaid: [] });
    state.priorityPlayer = 1;
    expect(activate(state, 1, 'KRAKEN_NEGATE', kraken)).toMatchObject({ ok: false, reason: 'conditions-not-met' });
  });
});

describe('Choices and picks', () => {
  it('Drácula: the player picks which of its effects to apply, then what it destroys', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const dracula = await onField(state, 0, 'Drácula, El primer Inmortal');
    const slime = await onField(state, 1, 'Slime');
    const valkiria = await onField(state, 1, 'Valkiria');
    const choose = activate(state, 0, 'DRACULA_CHOICE', dracula);
    expect(choose).toMatchObject({ reason: 'choose-target', prompt: 'Elige qué efecto aplicar' });
    expect(choose.options.map((o) => o.instanceId)).toEqual(['choice:0', 'choice:1']);
    const pick = activate(state, 0, 'DRACULA_CHOICE', dracula, ['choice:1']);
    expect(pick.options.map((o) => o.instanceId).sort()).toEqual([slime, valkiria].sort());
    expect(activate(state, 0, 'DRACULA_CHOICE', dracula, ['choice:1', valkiria]).ok).toBe(true);
    passAll(state);
    expect(monster(state, valkiria)).toBeUndefined();
    expect(state.players[0].vp).toBe(80 - 10 + 11); // paid 10 VP, recovered Valkiria's 11 Atk
    expect(state.players[0].pixelcoins).toBe(12); // the other option didn't run
  });

  it('Pegaso turns the monster the player picks into an Hada', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const pegaso = await onField(state, 0, 'Pegaso');
    const slime = await onField(state, 1, 'Slime');
    expect(activate(state, 0, 'PEGASO', pegaso, [slime]).ok).toBe(true);
    passAll(state);
    expect(matchesFilter(monster(state, slime), { breed: 'Hada' })).toBe(true);
    expect(activate(state, 0, 'PEGASO', pegaso, [slime])).toMatchObject({ ok: false, reason: 'once-per-turn' });
  });

  it('Héroe de Marfil: on summon, sends the Héroe the player picks from the Mazo to the Cementerio', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const a = await toDeckTop(state, 0, 'Héroe Silencioso');
    const b = await toDeckTop(state, 0, 'Héroe Corrupto');
    const marfil = await toHand(state, 0, 'Héroe de Marfil');
    expect(applyAction(state, 0, { type: 'NORMAL_SUMMON', instanceId: marfil, position: 'attack' }).ok).toBe(true);
    const pending = viewFor(state, 0).pendingTriggerChoice;
    expect(pending.options.map((o) => o.instanceId).sort()).toEqual([a, b].sort());
    expect(applyAction(state, 0, { type: 'RESOLVE_TRIGGER_CHOICE', targets: [b] }).ok).toBe(true);
    expect(state.players[0].graveyard).toContain(b);
    expect(state.players[0].deck).toContain(a);
  });

  it('Íncubo moves to the free zone the player picks, and weakens its column', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const incubo = await onField(state, 0, 'Íncubo', { slot: 2 });
    const across = await onField(state, 1, 'Valkiria', { slot: 2 });
    const aside = await onField(state, 1, 'Slime', { slot: 4 });
    recomputeContinuous(state);
    expect(monster(state, across).tempBuff).toEqual({ atk: -2, def: -2 });
    expect(monster(state, aside).tempBuff).toEqual({ atk: 0, def: 0 });
    expect(activate(state, 0, 'INCUBO_RELOCATE', incubo).ok).toBe(true);
    passAll(state);
    expect(viewFor(state, 0).pendingTriggerChoice).toMatchObject({ kind: 'slot', prompt: 'Elige a qué zona se desplaza' });
    expect(applyAction(state, 0, { type: 'RESOLVE_TRIGGER_CHOICE', slot: 4 }).ok).toBe(true);
    expect(state.players[0].field.monsters[4]).toMatchObject({ instanceId: incubo });
    expect(monster(state, aside).tempBuff).toEqual({ atk: -2, def: -2 });
    expect(monster(state, across).tempBuff).toEqual({ atk: 0, def: 0 });
  });

  it('Carnívora Come Hombres equips the picked attack-position monster and gets +1 Atk; it goes to its owner\'s Cementerio later', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const carnivora = await onField(state, 0, 'Carnivora Come Hombres');
    const slime = await onField(state, 1, 'Slime');
    expect(activate(state, 0, 'CARNIVORA_STEAL_EQUIP', carnivora, [slime]).ok).toBe(true);
    passAll(state);
    expect(monster(state, slime)).toBeUndefined();
    expect(state.players[0].field.support.find((s) => s && s.instanceId === slime)).toMatchObject({ equippedTo: carnivora });
    expect(monster(state, carnivora).tempBuff.atk).toBe(1);
    moveToZone(state, carnivora, 'graveyard');
    expect(state.players[1].graveyard).toContain(slime);
  });
});

describe('Actions and flags that used to do nothing', () => {
  it('Lich: the rival loses 5 VP every time they activate an effect', async () => {
    const state = await makeDuel();
    await onField(state, 0, 'Lich');
    const cubo = await onField(state, 1, 'Cubo Gelatinoso');
    await onField(state, 0, 'Slime');
    recomputeContinuous(state);
    toPhase(state, 'main1', 1);
    expect(activate(state, 1, 'CUBO_GELATINOSO_NEGATE', cubo).ok || activate(state, 1, 'CUBO_GELATINOSO_NEGATE', cubo, [state.players[0].field.monsters.find(Boolean).instanceId]).ok).toBe(true);
    expect(state.players[1].vp).toBe(80 - 5);
  });

  it('Héroe Corrupto: the rival\'s monsters lose the same as it does', async () => {
    const state = await makeDuel();
    const corrupto = await onField(state, 0, 'Héroe Corrupto');
    await onField(state, 0, 'Héroe Silencioso');
    const slime = await onField(state, 1, 'Slime');
    recomputeContinuous(state);
    expect(monster(state, corrupto).tempBuff).toEqual({ atk: -2, def: -2 });
    expect(monster(state, slime).tempBuff).toEqual({ atk: -2, def: -2 });
  });

  it('Héroe Berserker: the rival\'s monsters lose Atk equal to its materials\' combined Atk', async () => {
    const state = await makeDuel();
    const berserker = await onField(state, 0, 'Héroe Berserker');
    monster(state, berserker).materials = [await instance(0, 'Héroe Silencioso'), await instance(0, 'Héroe Corrupto')];
    const valkiria = await onField(state, 1, 'Valkiria');
    recomputeContinuous(state);
    expect(monster(state, valkiria).tempBuff.atk).toBe(-(2 + 3));
  });

  it('Gigante Elemental is immune to effects of monsters sharing an attribute with its materials', async () => {
    const state = await makeDuel();
    const gigante = await onField(state, 1, 'Gigante Elemental');
    monster(state, gigante).materials = [await instance(1, 'Fire Giant')];
    recomputeContinuous(state);
    const fireSource = await onField(state, 0, 'Bálor'); // Fuego
    const darkSource = await onField(state, 0, 'Cubo Gelatinoso'); // Oscuridad
    expect(canAffect({ state, controllerIndex: 0, sourceInstanceId: fireSource }, monster(state, gigante))).toBe(false);
    expect(canAffect({ state, controllerIndex: 0, sourceInstanceId: darkSource }, monster(state, gigante))).toBe(true);
  });

  it('Doppelganger counts as every type, and copies the effect of the monster it destroys', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const doppel = await onField(state, 0, 'Doppelganger');
    const duergar = await onField(state, 1, 'Duérgar');
    recomputeContinuous(state);
    expect(matchesFilter(monster(state, doppel), { breed: 'Insecto' })).toBe(true);
    expect(activate(state, 0, 'DOPPEL_COPY_EFFECT', doppel, [duergar]).ok).toBe(true);
    passAll(state);
    expect(monster(state, duergar)).toBeUndefined();
    expect(effectCodesOf(monster(state, doppel))).toContain('DUERGAR_BUFF');
  });

  it('Anillo de Boda: for the rest of the turn, when the rival draws or gains VP, so do you', async () => {
    const state = await makeDuel();
    registry.mirrorEvent({ state, controllerIndex: 0 }, { event: 'draw' });
    registry.mirrorEvent({ state, controllerIndex: 0 }, { event: 'gainVP' });
    const hand = state.players[0].hand.length;
    registry.drawCards({ state, controllerIndex: 1 }, { amount: 2 });
    registry.gainVP({ state, controllerIndex: 1 }, { amount: 4 });
    expect(state.players[0].hand.length).toBe(hand + 2);
    expect(state.players[0].vp).toBe(84);
  });

  it('Moneda de la Fortuna runs the step the coin picks', async () => {
    const state = await makeDuel();
    registry.coinFlip({ state, controllerIndex: 0 }, getEffect('MONEDA_FORTUNA_COINFLIP').actions[0].args);
    expect(state.players[0].vp).toBe(state.lastCoinFlip ? 83 : 77);
  });

  it('Licántropo Cazador summoned by a Licano\'s effect: Atk 10 until the end of the next turn, and back to the Mazo at the end of the Battle Phase, bringing out another Licano', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    toPhase(state, 'main1', 1);
    toPhase(state, 'main1', 0); // turn 3 has a Battle Phase
    const alfa = await toHand(state, 0, 'Licántropo Alfa');
    const cazador = await toDeckTop(state, 0, 'Licántropo Cazador');
    const { summonByEffect } = require('../../game/effects/fieldActions');
    summonByEffect({ state, controllerIndex: 0, sourceInstanceId: alfa }, cazador);
    recomputeContinuous(state);
    expect(monster(state, cazador).tempBuff.atk + monster(state, cazador).baseAtk).toBe(10);
    const beta = await toDeckTop(state, 0, 'Licántropo Beta');
    applyAction(state, 0, { type: 'ADVANCE_PHASE' }); // battle
    applyAction(state, 0, { type: 'ADVANCE_PHASE' }); // end of the Battle Phase
    expect(monster(state, cazador)).toBeUndefined();
    expect(state.players[0].deck).toContain(cazador);
    expect(monster(state, beta)).toBeDefined();
  });
});

describe('Optional effects ("Puedes...")', () => {
  const summonEsperanza = async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    await onField(state, 0, 'Héroe Silencioso');
    const targets = [await onField(state, 1, 'Slime'), await onField(state, 1, 'Valkiria'), await onField(state, 1, 'Pez Leviatán')];
    const esperanza = await onField(state, 0, 'Héroe de la Esperanza');
    fireTrigger(state, 'onSummon', { instanceId: esperanza, cardId: esperanza.split(':')[1], controllerIndex: 0 });
    return { state, targets };
  };

  it('Héroe de la Esperanza: the player picks how many to destroy, up to the number of different Héroes, and draws one per card', async () => {
    const { state, targets } = await summonEsperanza();
    const first = viewFor(state, 0).pendingTriggerChoice;
    expect(first.prompt).toContain('hasta 2');
    expect(first.options.map((o) => o.instanceId)).toEqual(expect.arrayContaining([...targets, 'done:0']));
    const next = applyAction(state, 0, { type: 'RESOLVE_TRIGGER_CHOICE', targets: [targets[1]] });
    expect(next).toMatchObject({ ok: false, reason: 'choose-target' });
    expect(next.options.map((o) => o.name)).toContain('Terminar');
    const hand = state.players[0].hand.length;
    expect(applyAction(state, 0, { type: 'RESOLVE_TRIGGER_CHOICE', targets: [targets[1], 'done:0'] }).ok).toBe(true);
    expect(monster(state, targets[1])).toBeUndefined();
    expect(monster(state, targets[0])).toBeDefined();
    expect(state.players[0].hand.length).toBe(hand + 1);
  });

  it('Héroe de la Esperanza: choosing none destroys nothing and draws nothing', async () => {
    const { state, targets } = await summonEsperanza();
    const hand = state.players[0].hand.length;
    expect(applyAction(state, 0, { type: 'RESOLVE_TRIGGER_CHOICE', targets: ['done:0'] }).ok).toBe(true);
    targets.forEach((id) => expect(monster(state, id)).toBeDefined());
    expect(state.players[0].hand.length).toBe(hand);
  });

  it('Héroe del Viento: its "puedes elegir activar 1 de los efectos" can be declined', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const viento = await onField(state, 0, 'Héroe del Viento');
    fireTrigger(state, 'onSummon', { instanceId: viento, cardId: viento.split(':')[1], controllerIndex: 0 });
    const pending = viewFor(state, 0).pendingTriggerChoice;
    expect(pending.options.map((o) => o.name)).toEqual(['Destruye 1 carta de Apoyo en el Campo.', 'Añade a la Mano un monstruo "Héroe" del Mazo.', 'No usar el efecto']);
    const hand = state.players[0].hand.length;
    expect(applyAction(state, 0, { type: 'RESOLVE_TRIGGER_CHOICE', targets: ['choice:skip'] }).ok).toBe(true);
    expect(state.pendingTriggerChoices).toHaveLength(0);
    expect(state.players[0].hand.length).toBe(hand);
  });

  it('Bálor: "puedes activar uno de estos efectos" — one of the two per turn, not both', async () => {
    const state = await makeDuel();
    const balor = await onField(state, 0, 'Bálor');
    await onField(state, 1, 'Slime');
    toPhase(state, 'main1', 0);
    expect(activate(state, 0, 'BALOR_EXTRA_ATTACK', balor).ok).toBe(true);
    passAll(state);
    expect(activate(state, 0, 'BALOR_INFLICT_BURN', balor)).toMatchObject({ ok: false, reason: 'conditions-not-met' });
  });

  it('Damarco no longer has the "destroy 2 cards" effect its text never had', async () => {
    expect(getCard(await idOf('Damarco, licántropo luchador')).effectCodes).toEqual(['DAMARCO_EXTRA_ATTACKS']);
  });
});

describe('Keywords and "monstruo sin efecto"', () => {
  it('no keyword effects remain in the data', () => {
    expect(effects.filter((e) => e.type === 'keyword')).toHaveLength(0);
  });

  it('a monster whose only effects describe how it is summoned counts as "sin efecto"', async () => {
    expect(matchesCardFilter(getCard(await idOf('Valkiria')), { effectless: true })).toBe(true);
    expect(matchesCardFilter(getCard(await idOf('Fire Giant')), { effectless: true })).toBe(true);
    expect(matchesCardFilter(getCard(await idOf('Doppelganger')), { effectless: true })).toBe(false);
    expect(matchesCardFilter(getCard(await idOf('Doppelganger')), { effectless: false })).toBe(true);
  });
});
