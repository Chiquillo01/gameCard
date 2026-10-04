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
const { seedCatalog, makeDuel, toHand, toDeckTop, toGraveyard, onField, toPhase, passAll, monster, instance, idOf } = require('./engineHelpers');
const { STARTING_VP } = require('../../game/constants');
const { placePending } = require('./chainHelpers');

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
    placeSupport(state, await instance(1, 'Trampa de Madera'), 1, { faceDown: true }); // "un monstruo": never offered
    const choose = activate(state, 0, 'DRACULA_CHOICE', dracula);
    expect(choose).toMatchObject({ reason: 'choose-target', prompt: 'Elige qué efecto aplicar' });
    expect(choose.options.map((o) => o.instanceId)).toEqual(['choice:0', 'choice:1']);
    const pick = activate(state, 0, 'DRACULA_CHOICE', dracula, ['choice:1']);
    expect(pick.options.map((o) => o.instanceId).sort()).toEqual([slime, valkiria].sort());
    expect(activate(state, 0, 'DRACULA_CHOICE', dracula, ['choice:1', valkiria]).ok).toBe(true);
    passAll(state);
    expect(monster(state, valkiria)).toBeUndefined();
    expect(state.players[0].vp).toBe(STARTING_VP - 8 + 11); // paid 8 VP, recovered Valkiria's 11 Atk
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
    const aside = await onField(state, 1, 'Slime', { slot: 0 }); // faces zone 4 (the rival's side is turned 180°)
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
    expect(applyAction(state, 0, { type: 'RESOLVE_TRIGGER_CHOICE', slot: 0 }).ok).toBe(true); // which support zone
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
    expect(state.players[1].vp).toBe(STARTING_VP - 5);
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
    monster(state, gigante).materials = [await instance(1, 'Gigante de Fuego')];
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
    expect(state.players[0].vp).toBe(STARTING_VP + 4);
  });

  it('Moneda de la Fortuna runs the step the coin picks', async () => {
    const state = await makeDuel();
    registry.coinFlip({ state, controllerIndex: 0 }, getEffect('MONEDA_FORTUNA_COINFLIP').actions[0].args);
    expect(state.players[0].vp).toBe(state.lastCoinFlip ? STARTING_VP + 5 : STARTING_VP - 3); // heads +5, tails -3
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
    placePending(state);
    recomputeContinuous(state);
    expect(monster(state, cazador).tempBuff.atk + monster(state, cazador).baseAtk).toBe(10);
    const beta = await toDeckTop(state, 0, 'Licántropo Beta');
    applyAction(state, 0, { type: 'ADVANCE_PHASE' }); // battle
    applyAction(state, 0, { type: 'ADVANCE_PHASE' }); // end of the Battle Phase
    placePending(state);
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
    expect(matchesCardFilter(getCard(await idOf('Gigante de Fuego')), { effectless: true })).toBe(true);
    expect(matchesCardFilter(getCard(await idOf('Doppelganger')), { effectless: true })).toBe(false);
    expect(matchesCardFilter(getCard(await idOf('Doppelganger')), { effectless: false })).toBe(true);
  });
});

describe('Espora Venenosa', () => {
  it('turned face-up: one pick poisons that monster, which also loses 2 Atk, and the rival takes 2', async () => {
    const state = await makeDuel();
    const espora = await onField(state, 0, 'Espora Venenosa', { position: 'defense', faceDown: true });
    const orco = await onField(state, 1, 'Orco Guerrero');
    await onField(state, 1, 'Orco Gladiador');
    monster(state, espora).summonedTurn = 0; // set on an earlier turn
    toPhase(state, 'main1', 0);

    expect(applyAction(state, 0, { type: 'CHANGE_POSITION', instanceId: espora, position: 'attack' })).toMatchObject({ ok: true, flipped: true });
    expect(viewFor(state, 0).pendingTriggerChoice).toMatchObject({ kind: 'effect' });
    // A single pick: the Atk loss goes to the monster just poisoned, nothing more is asked.
    expect(applyAction(state, 0, { type: 'RESOLVE_TRIGGER_CHOICE', targets: [orco] }).ok).toBe(true);
    expect(viewFor(state, 0).pendingTriggerChoice).toBeNull();

    const poisoned = viewFor(state, 0).players[1].field.monsters.find((m) => m && m.instanceId === orco);
    expect(poisoned).toMatchObject({ statuses: ['Veneno'], atk: 1, printedAtk: 3 });
    expect(state.players[1].vp).toBe(STARTING_VP - 2);
    expect(state.log.some((l) => l.message === 'Orco Guerrero queda en estado Veneno (por Espora Venenosa).')).toBe(true);

    // The card doesn't say "hasta el final del turno": the Atk loss stays after the status ends.
    toPhase(state, 'main1', 1);
    const later = viewFor(state, 0).players[1].field.monsters.find((m) => m && m.instanceId === orco);
    expect(later.statuses || []).not.toContain('Veneno');
    expect(later).toMatchObject({ atk: 1, printedAtk: 3 });
    expect(later.statMods).toEqual(expect.arrayContaining([expect.objectContaining({ atk: -2 })]));
  });
});

describe('Exiled "hasta la Fase Final"', () => {
  it('Traición de Vida: only a rival monster; gains VP equal to its Atk; it comes back in the Fase Final', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const traicion = await toHand(state, 0, 'Traición de Vida');
    expect(applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: traicion })).toMatchObject({ ok: false, reason: 'no-legal-target' });

    await onField(state, 0, 'Orco Guerrero'); // the player's own monster is never offered
    const cactus = await onField(state, 1, 'Cactus Violento', { position: 'defense' });
    expect(applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: traicion }).ok).toBe(true);
    passAll(state);
    expect(state.players[1].banished).toContain(cactus);
    expect(state.players[0].vp).toBe(STARTING_VP + 4); // Cactus Violento's Atk

    toPhase(state, 'end', 0);
    expect(state.players[1].banished).not.toContain(cactus);
    expect(monster(state, cactus)).toMatchObject({ position: 'defense', faceDown: false });
    expect(state.log.some((l) => l.message === 'Cactus Violento vuelve del Exilio al Campo.')).toBe(true);
  });

  it('Orco Gigante: the monster it exiles comes back at the end of the turn', async () => {
    const state = await makeDuel();
    const gigante = await onField(state, 0, 'Orco Gigante');
    const cactus = await onField(state, 1, 'Cactus Violento');
    toPhase(state, 'main1', 0);
    expect(applyAction(state, 0, { type: 'ACTIVATE_EFFECT', effectId: 'ORCO_GIGANTE_EXILE', sourceInstanceId: gigante, targets: [cactus] }).ok).toBe(true);
    passAll(state);
    expect(state.players[1].banished).toContain(cactus);
    toPhase(state, 'end', 0);
    expect(monster(state, cactus)).toBeTruthy();
  });
});

describe('Cards that pick their target', () => {
  it('Hechizo de volteo: the picked face-up monster goes to defense face-down', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const orco = await onField(state, 1, 'Orco Guerrero');
    await onField(state, 1, 'Orco Gladiador');
    const hechizo = await toHand(state, 0, 'Hechizo de volteo');
    const ask = applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: hechizo });
    expect(ask).toMatchObject({ ok: false, reason: 'choose-target', prompt: 'Elige el monstruo que pasa a defensa boca abajo' });
    expect(applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: hechizo, targets: [orco] }).ok).toBe(true);
    passAll(state);
    expect(monster(state, orco)).toMatchObject({ position: 'defense', faceDown: true });
  });

  it('Capitán Bandido: takes control of the monster the player picks, not the strongest', async () => {
    const state = await makeDuel();
    const capitan = await onField(state, 0, 'Capitán Bandido');
    const weak = await onField(state, 1, 'Slime');
    await onField(state, 1, 'Orco Gladiador');
    toPhase(state, 'main1', 0);
    expect(applyAction(state, 0, { type: 'ACTIVATE_EFFECT', effectId: 'CAPITAN_BANDIDO_STEAL', sourceInstanceId: capitan, targets: [weak] }).ok).toBe(true);
    passAll(state);
    placePending(state);
    expect(state.players[0].field.monsters.some((m) => m && m.instanceId === weak)).toBe(true);
  });

  it('Gato del Destino: shuffles the Licántropos picked from the Cementerio, not itself', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const lics = await Promise.all(['Licántropo Beta', 'Licántropo Cazador', 'Licántropo de Hielo', 'Licántropo Gigante'].map((n) => toGraveyard(state, 0, n)));
    const gato = await toHand(state, 0, 'Gato del Destino');
    expect(applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: gato })).toMatchObject({ ok: false, reason: 'choose-target' });
    expect(applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: gato, targets: lics.slice(0, 3) }).ok).toBe(true);
    passAll(state);
    expect(state.players[0].deck).toEqual(expect.arrayContaining(lics.slice(0, 3)));
    expect(state.players[0].graveyard).toEqual(expect.arrayContaining([lics[3], gato]));
  });

  it('Sacrificio memorable: one monster picked on each side, both destroyed; needs one on each', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const sacrificio = await toHand(state, 0, 'Sacrificio memorable');
    const mine = await onField(state, 0, 'Orco Guerrero');
    const keep = await onField(state, 0, 'Slime');
    expect(applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: sacrificio })).toMatchObject({ ok: false, reason: 'no-legal-target' });

    const theirs = await onField(state, 1, 'Orco Gladiador');
    const spared = await onField(state, 1, 'Cactus Violento');
    const ask = applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: sacrificio });
    expect(ask).toMatchObject({ ok: false, reason: 'choose-target', prompt: 'Elige el monstruo de tu Campo que se destruye' });
    expect(ask.options.map((o) => o.instanceId).sort()).toEqual([mine, keep].sort());
    const next = applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: sacrificio, targets: [mine] });
    expect(next).toMatchObject({ ok: false, reason: 'choose-target', prompt: 'Elige el monstruo del oponente que se destruye' });
    expect(applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: sacrificio, targets: [mine, theirs] }).ok).toBe(true);
    passAll(state);
    expect(state.players[0].graveyard).toContain(mine);
    expect(state.players[1].graveyard).toContain(theirs);
    expect(monster(state, keep)).toBeDefined();
    expect(monster(state, spared)).toBeDefined();
  });
});

describe('Equipping a monster as an Equipo', () => {
  it('the player picks which support zone it goes to', async () => {
    const state = await makeDuel();
    const carnivora = await onField(state, 0, 'Carnivora Come Hombres');
    const victim = await onField(state, 1, 'Orco Guerrero');
    toPhase(state, 'main1', 0);
    expect(applyAction(state, 0, { type: 'ACTIVATE_EFFECT', effectId: 'CARNIVORA_STEAL_EQUIP', sourceInstanceId: carnivora, targets: [victim] }).ok).toBe(true);
    passAll(state);
    // Four free support zones: it waits for the pick, the monster still where it was.
    expect(viewFor(state, 0).pendingTriggerChoice).toMatchObject({ kind: 'slot', zone: 'support', slots: [0, 1, 2, 3] });
    expect(monster(state, victim)).toBeTruthy();
    expect(applyAction(state, 0, { type: 'RESOLVE_TRIGGER_CHOICE', slot: 2 }).ok).toBe(true);
    expect(state.players[0].field.support[2]).toMatchObject({ instanceId: victim, equippedTo: carnivora, isMonsterEquip: true });
    expect(monster(state, victim)).toBeFalsy();
  });
});

describe('An Apoyo in hand', () => {
  it('is only played with ACTIVATE_SUPPORT: its "en activación" effect is not a free button (Olla de la Usura)', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const olla = await toHand(state, 0, 'Olla de la Usura');
    expect(viewFor(state, 0).players[0].hand.find((c) => c.instanceId === olla).availableEffects).toEqual([]);
    const handBefore = state.players[0].hand.length;
    expect(applyAction(state, 0, { type: 'ACTIVATE_EFFECT', effectId: 'OLLA_USURA_DRAW', sourceInstanceId: olla })).toMatchObject({ ok: false, reason: 'play-support-instead' });
    expect(state.players[0].hand).toHaveLength(handBefore);
  });
});

describe('Options to pick from say where each card is', () => {
  it("whose, which zone and position, Atk/Vida — and a rival's face-down card stays hidden", async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const mine = await onField(state, 0, 'Slime', { position: 'defense' });
    const theirs = await onField(state, 1, 'Orco Gladiador');
    const hidden = await onField(state, 1, 'Orco Guerrero', { position: 'defense', faceDown: true });
    const trap = await instance(1, 'Trampa de Madera');
    placeSupport(state, trap, 1, { faceDown: true });
    const relampago = await toHand(state, 0, 'Relámpago');
    const ask = applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: relampago });
    expect(ask).toMatchObject({ ok: false, reason: 'choose-target' });
    // "Destruye un monstruo": the rival's face-down Apoyo isn't one of the options.
    expect(ask.options.map((o) => o.instanceId).sort()).toEqual([mine, theirs, hidden].sort());
    const byId = Object.fromEntries(ask.options.map((o) => [o.instanceId, o]));
    expect(byId[mine]).toMatchObject({ name: 'Slime', where: { owner: 'self', zone: 'monster', slot: 0, position: 'defense', faceDown: false } });
    expect(byId[theirs]).toMatchObject({ name: 'Orco Gladiador', where: { owner: 'rival', zone: 'monster', slot: 0, position: 'attack', atk: 3 } });
    expect(byId[hidden]).toEqual({ instanceId: hidden, name: 'Monstruo boca abajo', image: null, where: { owner: 'rival', zone: 'monster', slot: 1, position: 'defense', faceDown: true } });
  });
});

describe('Mazo-C: what each Compilación needs', () => {
  it('lists the recipe, what the player has for it, and a suggestion once it can be compiled', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const gigante = await instance(0, 'Orco Gigante');
    state.players[0].extra.push(gigante);
    const orco1 = await onField(state, 0, 'Orco Guerrero');
    await toHand(state, 0, 'Orco Gladiador'); // in hand: the recipe only takes them from the field

    const pending = viewFor(state, 0).players[0].extra.find((c) => c.instanceId === gigante).compile;
    expect(pending).toMatchObject({ ready: false, blockedBy: 'Te faltan materiales.', suggested: [] });
    expect(pending.requirements).toEqual([expect.objectContaining({ label: '2 × monstruo Orco', zones: ['Campo'], count: 2, have: 1 })]);
    expect(pending.requirements[0].candidates).toEqual([expect.objectContaining({ instanceId: orco1, name: 'Orco Guerrero', zoneLabel: 'Campo', slot: 0 })]);

    const orco2 = await onField(state, 0, 'Orco Gladiador');
    const ready = viewFor(state, 0).players[0].extra.find((c) => c.instanceId === gigante).compile;
    expect(ready).toMatchObject({ ready: true, blockedBy: null });
    expect(ready.suggested.sort()).toEqual([orco1, orco2].sort());
    expect(applyAction(state, 0, { type: 'COMPILE_SUMMON', instanceId: gigante, materialInstanceIds: ready.suggested }).ok).toBe(true);
  });

  it('Pez Dorado ("2 monstruos Agua") and Amooth ("3 monstruos Marinos") take any of them', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const dorado = await instance(0, 'Pez Dorado de la Suerte');
    const amooth = await instance(0, 'Protector del Mar, Amooth');
    state.players[0].extra.push(dorado, amooth);
    await onField(state, 0, 'HipoCampo');
    await onField(state, 0, 'Cangrejo Archipiélago');
    const info = (id) => viewFor(state, 0).players[0].extra.find((c) => c.instanceId === id).compile;
    expect(info(dorado)).toMatchObject({ ready: true });
    expect(info(amooth)).toMatchObject({ ready: false, requirements: [expect.objectContaining({ have: 2, count: 3 })] });
    await onField(state, 0, 'Pez Leviatán');
    expect(info(amooth)).toMatchObject({ ready: true });
    expect(applyAction(state, 0, { type: 'COMPILE_SUMMON', instanceId: dorado, materialInstanceIds: info(dorado).suggested }).ok).toBe(true);
  });

  it('Gigante Elemental: 5 monsters with "Gigante" in the name, from the field or the Cementerio', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const elemental = await instance(0, 'Gigante Elemental');
    state.players[0].extra.push(elemental);
    await onField(state, 0, 'Gigante de Fuego');
    await onField(state, 0, 'Gigante del Trueno');
    await toGraveyard(state, 0, 'Gigante de Rocas');
    await toGraveyard(state, 0, 'Gigante de las Nubes');
    const info = () => viewFor(state, 0).players[0].extra.find((c) => c.instanceId === elemental).compile;
    expect(info()).toMatchObject({ ready: false, requirements: [expect.objectContaining({ have: 4, count: 5 })] });
    await toGraveyard(state, 0, 'Gigante de Hielo');
    expect(info()).toMatchObject({ ready: true });
    expect(applyAction(state, 0, { type: 'COMPILE_SUMMON', instanceId: elemental, materialInstanceIds: info().suggested }).ok).toBe(true);
  });

  it('Catapulta compiles from 2 Balista tokens, which then stop existing', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const catapulta = await instance(0, 'Catapulta');
    state.players[0].extra.push(catapulta);
    const def = { name: 'Balista', attribute: 'Tierra', breed: 'Metal', level: 2, atk: 2, def: 2 };
    const tokens = [0, 1].map((slot) => {
      const id = `token:Balista:test${slot}`;
      state.players[0].field.monsters[slot] = { instanceId: id, cardId: null, isToken: true, tokenDef: def, position: 'attack', faceDown: false, baseAtk: 2, baseDef: 2, summonedTurn: 0, equips: [], counters: {} };
      return id;
    });
    const info = viewFor(state, 0).players[0].extra.find((c) => c.instanceId === catapulta).compile;
    expect(info).toMatchObject({ ready: true });
    expect(applyAction(state, 0, { type: 'COMPILE_SUMMON', instanceId: catapulta, materialInstanceIds: info.suggested }).ok).toBe(true);
    expect(monster(state, catapulta)).toMatchObject({ materials: [] });
    tokens.forEach((id) => expect(monster(state, id)).toBeUndefined());
  });
});

describe('Aboleth: "cuando es enviada del Campo al Cementerio" summons 2 Tentáculo Musculoso', () => {
  const tentacles = (state, p) => state.players[p].field.monsters.filter((m) => m && m.isToken && m.tokenDef.name === 'Tentáculo Musculoso');

  it('when destroyed by an effect (Relámpago)', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const aboleth = await onField(state, 1, 'Aboleth');
    const relampago = await toHand(state, 0, 'Relámpago');
    expect(applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: relampago, targets: [aboleth] }).ok).toBe(true);
    passAll(state);
    placePending(state);
    expect(state.players[1].graveyard).toContain(aboleth);
    expect(tentacles(state, 1)).toHaveLength(2);
  });

  it('when destroyed in battle', async () => {
    const state = await makeDuel();
    const gigante = await onField(state, 0, 'Gigante de Fuego');
    const aboleth = await onField(state, 1, 'Aboleth');
    toPhase(state, 'battle', 0);
    expect(applyAction(state, 0, { type: 'DECLARE_ATTACK', attackerInstanceId: gigante, targetInstanceId: aboleth }).ok).toBe(true);
    passAll(state);
    placePending(state);
    expect(state.players[1].graveyard).toContain(aboleth);
    expect(tentacles(state, 1)).toHaveLength(2);
  });

  it('its own Tentáculos (Agua) can be destroyed to bring Aboleth back; a token just disappears', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const aboleth = await onField(state, 0, 'Aboleth');
    const relampago = await toHand(state, 0, 'Relámpago');
    expect(applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: relampago, targets: [aboleth] }).ok).toBe(true);
    passAll(state);
    placePending(state);
    const [tentacle] = tentacles(state, 0);
    expect(viewFor(state, 0).players[0].graveyard.find((g) => g.instanceId === aboleth).specialSummonAvailable).toBe(true);
    const ask = applyAction(state, 0, { type: 'SPECIAL_SUMMON', instanceId: aboleth });
    expect(ask).toMatchObject({ ok: false, reason: 'choose-target' });
    expect(applyAction(state, 0, { type: 'SPECIAL_SUMMON', instanceId: aboleth, targets: [tentacle.instanceId] }).ok).toBe(true);
    expect(monster(state, aboleth)).toBeDefined();
    expect(tentacles(state, 0)).toHaveLength(1);
    expect(state.players[0].graveyard.some((id) => id.startsWith('token:'))).toBe(false);
  });

  it('when destroyed to pay a cost (another Aboleth coming out)', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const first = await onField(state, 0, 'Aboleth');
    const second = await toHand(state, 0, 'Aboleth');
    expect(applyAction(state, 0, { type: 'SPECIAL_SUMMON', instanceId: second, targets: [first] }).ok).toBe(true);
    placePending(state);
    expect(state.players[0].graveyard).toContain(first);
    expect(monster(state, second)).toBeDefined();
    expect(tentacles(state, 0)).toHaveLength(2);
  });
});

describe('A one-shot Apoyo waiting on the Pila', () => {
  it('Tifón Místico: its "en activación" effect cannot be used again while it waits to resolve', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const oceano = await instance(1, 'Oceano');
    placeSupport(state, await instance(1, 'Trampa de Madera'), 1, { faceDown: true });
    state.players[1].field.territory = { instanceId: oceano, cardId: oceano.split(':')[1], faceDown: false, counters: {} };
    const cometa = await toHand(state, 0, 'Tifón Místico');
    const res = applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: cometa, targets: [oceano] });
    expect(res.ok).toBe(true);
    // While it's on the Pila (face-up in a support zone) it offers no effect of its own…
    const onField = viewFor(state, 0).players[0].field.support.find((s) => s && s.instanceId === cometa);
    expect(onField.availableEffects).toEqual([]);
    // …and activating it again is refused.
    applyAction(state, 1, { type: 'PASS_CHAIN' });
    expect(applyAction(state, 0, { type: 'ACTIVATE_EFFECT', effectId: 'DESTRUIR_APOYO', sourceInstanceId: cometa })).toMatchObject({ ok: false });
    passAll(state);
    expect(state.log.filter((l) => / es destruida\./.test(l.message))).toHaveLength(1);
  });
});

describe('Refuerzos from the Cementerio', () => {
  it('needs 2 monsters there, lets the player pick which 2, then draws 1', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const refuerzos = await toGraveyard(state, 0, 'Refuerzos');
    state.graveyardTurn = { [refuerzos]: 0 }; // sent on an earlier turn
    const one = await toGraveyard(state, 0, 'Slime');
    const act = (targets) => applyAction(state, 0, { type: 'ACTIVATE_EFFECT', effectId: 'REFUERZOS_GY_SHUFFLE_DRAW', sourceInstanceId: refuerzos, targets });
    expect(act([])).toMatchObject({ ok: false, reason: 'no-legal-target' });

    const two = await toGraveyard(state, 0, 'Orco Guerrero');
    const three = await toGraveyard(state, 0, 'Orco Gladiador');
    const ask = act([]);
    expect(ask).toMatchObject({ ok: false, reason: 'choose-target', prompt: 'Elige los 2 monstruos de tu Cementerio que barajas en el Mazo' });
    expect(act([one])).toMatchObject({ ok: false, reason: 'choose-target' });
    const hand = state.players[0].hand.length;
    expect(act([one, three]).ok).toBe(true);
    passAll(state);
    expect(state.players[0].graveyard).toContain(two);
    expect(state.players[0].graveyard).not.toContain(one);
    expect(state.players[0].graveyard).not.toContain(three);
    expect(state.players[0].banished).toContain(refuerzos);
    expect(state.players[0].hand).toHaveLength(hand + 1);
  });
});

describe('Doppelganger', () => {
  it('comes out only with 8 cards in the Cementerio', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const doppel = await toHand(state, 0, 'Doppelganger');
    expect(applyAction(state, 0, { type: 'NORMAL_SUMMON', instanceId: doppel, position: 'attack' })).toMatchObject({ ok: false });
    for (let i = 0; i < 7; i++) await toGraveyard(state, 0, 'Slime');
    expect(applyAction(state, 0, { type: 'SPECIAL_SUMMON', instanceId: doppel })).toMatchObject({ ok: false, reason: 'special-summon-condition-not-met' });
    await toGraveyard(state, 0, 'Slime');
    expect(applyAction(state, 0, { type: 'SPECIAL_SUMMON', instanceId: doppel }).ok).toBe(true);
    expect(monster(state, doppel)).toBeDefined();
  });

  it('destroys a monster (never an Apoyo) and takes its effect', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const doppel = await onField(state, 0, 'Doppelganger');
    const ent = await onField(state, 1, 'Ent');
    await onField(state, 1, 'Slime');
    const trap = await instance(1, 'Trampa de Madera');
    placeSupport(state, trap, 1, { faceDown: true });
    const ask = applyAction(state, 0, { type: 'ACTIVATE_EFFECT', effectId: 'DOPPEL_COPY_EFFECT', sourceInstanceId: doppel });
    expect(ask).toMatchObject({ ok: false, reason: 'choose-target' });
    expect(ask.options.map((o) => o.instanceId)).not.toContain(trap);
    expect(applyAction(state, 0, { type: 'ACTIVATE_EFFECT', effectId: 'DOPPEL_COPY_EFFECT', sourceInstanceId: doppel, targets: [ent] }).ok).toBe(true);
    passAll(state);
    expect(monster(state, ent)).toBeUndefined();
    // Ent's "añade un monstruo Planta del Mazo" is now Doppelganger's own.
    const view = viewFor(state, 0).players[0].field.monsters.find((m) => m && m.instanceId === doppel);
    expect(view.availableEffects).toContain('ENT_SEARCH_PLANTA');
    const espora = await toDeckTop(state, 0, 'Espora Venenosa');
    expect(applyAction(state, 0, { type: 'ACTIVATE_EFFECT', effectId: 'ENT_SEARCH_PLANTA', sourceInstanceId: doppel }).ok).toBe(true);
    passAll(state);
    placePending(state);
    expect(state.players[0].hand).toContain(espora);
  });
});

describe('Vampiro: "destruye una carta cuyo Atk actual sea diferente a su Atk original"', () => {
  it('only a face-up monster whose Atk really changed; never a face-down one', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const vampiro = await onField(state, 0, 'Vampiro');
    const hidden = await onField(state, 1, 'Orco Gladiador', { position: 'defense', faceDown: true });
    const plain = await onField(state, 1, 'Slime');
    const act = (targets) => applyAction(state, 0, { type: 'ACTIVATE_EFFECT', effectId: 'VAMPIRO_DESTROY_MODIFIED_ATK', sourceInstanceId: vampiro, targets });
    expect(act([])).toMatchObject({ ok: false, reason: 'no-legal-target' });
    expect(act([hidden])).toMatchObject({ ok: false });

    const boosted = await onField(state, 1, 'Orco Guerrero');
    monster(state, boosted).baseAtk += 2; // its Atk is no longer the printed one
    expect(act([]).ok).toBe(true); // the only legal one, picked without asking
    passAll(state);
    expect(monster(state, boosted)).toBeUndefined();
    expect(monster(state, hidden)).toBeDefined();
    expect(monster(state, plain)).toBeDefined();
  });
});

describe('Murcielago, Vampiro and Vampiresa: special summon only', () => {
  it('Murcielago pays 2 VP; it has no Normal Summon', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const bat = await toHand(state, 0, 'Murcielago');
    expect(applyAction(state, 0, { type: 'NORMAL_SUMMON', instanceId: bat, position: 'attack' })).toMatchObject({ ok: false });
    expect(applyAction(state, 0, { type: 'SPECIAL_SUMMON', instanceId: bat }).ok).toBe(true);
    expect(state.players[0].vp).toBe(STARTING_VP - 2);
  });

  it('Vampiro (5 VP) and Vampiresa (4 VP) need a Murcielago in the Campo or the Cementerio', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const vampiro = await toHand(state, 0, 'Vampiro');
    const vampiresa = await toHand(state, 0, 'Vampiresa');
    expect(applyAction(state, 0, { type: 'NORMAL_SUMMON', instanceId: vampiro, position: 'attack' })).toMatchObject({ ok: false });
    expect(applyAction(state, 0, { type: 'SPECIAL_SUMMON', instanceId: vampiro })).toMatchObject({ ok: false, reason: 'special-summon-condition-not-met' });

    await toGraveyard(state, 0, 'Murcielago');
    expect(applyAction(state, 0, { type: 'SPECIAL_SUMMON', instanceId: vampiro }).ok).toBe(true);
    expect(state.players[0].vp).toBe(STARTING_VP - 5);

    state.players[0].graveyard = [];
    expect(applyAction(state, 0, { type: 'SPECIAL_SUMMON', instanceId: vampiresa })).toMatchObject({ ok: false, reason: 'special-summon-condition-not-met' });
    await onField(state, 0, 'Murcielago');
    expect(applyAction(state, 0, { type: 'SPECIAL_SUMMON', instanceId: vampiresa }).ok).toBe(true);
    expect(state.players[0].vp).toBe(STARTING_VP - 9);
  });
});

describe('Vampiresa', () => {
  it('-3 Atk to the rival monster the player picks, only until the end of the turn', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const vampiresa = await onField(state, 0, 'Vampiresa');
    const orco = await onField(state, 1, 'Orco Guerrero');
    await onField(state, 1, 'Slime');
    expect(activate(state, 0, 'VAMPIRESA_CHOICE', vampiresa, ['choice:1', orco]).ok).toBe(true);
    passAll(state);
    expect(viewFor(state, 0).players[1].field.monsters.find((m) => m && m.instanceId === orco).atk).toBe(0); // 3 - 3
    toPhase(state, 'main1', 1);
    expect(viewFor(state, 0).players[1].field.monsters.find((m) => m && m.instanceId === orco).atk).toBe(3);
  });
});

describe('Guarida del Oscuro', () => {
  it('can be played with nothing to search; its "una vez por turno" search is used from the field', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const guarida = await toHand(state, 0, 'Guarida del Oscuro');
    expect(applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: guarida }).ok).toBe(true);
    passAll(state);
    expect(state.players[0].field.territory).toMatchObject({ instanceId: guarida });
    const search = () => applyAction(state, 0, { type: 'ACTIVATE_EFFECT', effectId: 'OSC_DEMON_SEARCH', sourceInstanceId: guarida });
    expect(search()).toMatchObject({ ok: false, reason: 'no-legal-target' }); // no Demonio/Inmortal/Pecador in the Mazo

    const slime = await toDeckTop(state, 0, 'Íncubo'); // Pecador
    const cubo = await toDeckTop(state, 0, 'Rey Demonio'); // a Demonio of Fuego counts too
    expect(viewFor(state, 0).players[0].field.territory.availableEffects).toContain('OSC_DEMON_SEARCH');
    expect(search().ok).toBe(true);
    passAll(state);
    let guard = 0;
    while (viewFor(state, 0).pendingTriggerChoice && guard++ < 5) {
      const pending = viewFor(state, 0).pendingTriggerChoice;
      applyAction(state, 0, { type: 'RESOLVE_TRIGGER_CHOICE', targets: [pending.options[pending.options.length - 1].instanceId] });
    }
    expect([slime, cubo].filter((id) => state.players[0].hand.includes(id) || state.players[0].graveyard.includes(id))).toHaveLength(2);
    expect(search()).toMatchObject({ ok: false, reason: 'once-per-turn' });
  });
});

describe('Guarida del Oscuro on the field', () => {
  it('+4 Atk/Vida to every Demonio, Inmortal, Pecador and Cambiaformas monster on the field', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const guarida = await toHand(state, 0, 'Guarida del Oscuro');
    const vampiro = await onField(state, 0, 'Vampiro'); // Inmortal
    const kraken = await onField(state, 0, 'Kraken'); // Monstruo Marino: not one of them
    const incubo = await onField(state, 1, 'Íncubo'); // Pecador, on the rival's side
    expect(applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: guarida }).ok).toBe(true);
    passAll(state);
    expect(monster(state, vampiro).tempBuff).toEqual({ atk: 4, def: 4 });
    expect(monster(state, incubo).tempBuff).toEqual({ atk: 4, def: 4 });
    expect(monster(state, kraken).tempBuff).toEqual({ atk: 0, def: 0 });
  });
});

describe('Intercanvio del Pequeño', () => {
  it('costs a card from hand the player picks; then summons a Nivel 1 monster from the Mazo', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const card = await toHand(state, 0, 'Intercanvio del Pequeño');
    const esqueleto = await toDeckTop(state, 0, 'Esqueleto'); // Nivel 1
    expect(applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: card })).toMatchObject({ ok: false, reason: 'cannot-pay-cost' });

    const keep = await toHand(state, 0, 'Orco Guerrero');
    const pay = await toHand(state, 0, 'Slime');
    const ask = applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: card });
    expect(ask).toMatchObject({ ok: false, reason: 'choose-target', prompt: 'Elige la carta que descartas' });
    expect(ask.options.map((o) => o.instanceId).sort()).toEqual([keep, pay].sort());
    expect(applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: card, targets: [pay] }).ok).toBe(true);
    expect(state.players[0].graveyard).toContain(pay);
    expect(state.players[0].hand).toContain(keep);
    passAll(state);
    placePending(state);
    expect(monster(state, esqueleto)).toBeDefined();
  });
});

describe('Loto de Obsidiana', () => {
  it('costs a card from hand; 3 pixels; from the Cementerio, 3 more but not the turn it got there', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    state.players[0].pixelcoins = 0;
    const loto = await toHand(state, 0, 'Loto de Obsidiana');
    expect(applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: loto })).toMatchObject({ ok: false, reason: 'cannot-pay-cost' });
    const pay = await toHand(state, 0, 'Slime');
    expect(applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: loto }).ok).toBe(true);
    passAll(state);
    expect(state.players[0].graveyard).toEqual(expect.arrayContaining([pay, loto]));
    expect(state.players[0].pixelcoins).toBe(3);

    state.players[1].pixelcoins = 10; // the rival has more pixels
    const fromGrave = () => applyAction(state, 0, { type: 'ACTIVATE_EFFECT', effectId: 'OBSIDIAN_GRAVE_PIXEL', sourceInstanceId: loto });
    expect(fromGrave()).toMatchObject({ ok: false, reason: 'conditions-not-met' }); // sent there this turn
    state.graveyardTurn[loto] = state.turnNumber - 1;
    expect(fromGrave().ok).toBe(true);
    passAll(state);
    expect(state.players[0].banished).toContain(loto);
    expect(state.players[0].pixelcoins).toBe(6);
  });
});

describe('Searches by kind of Apoyo and by what the text mentions', () => {
  it('a subtype/textIncludes filter only offers matching cards, not the whole Mazo', async () => {
    const { matchesCardFilter: m } = require('../../game/filters');
    const card = async (n) => getCard(await idOf(n));
    expect(m(await card('Trampa de Madera'), { subtype: 'Contraataque' })).toBe((await card('Trampa de Madera')).subtype === 'counter');
    expect(m(await card('Llamada al Héroe'), { subtype: 'Normal', textIncludes: 'Héroe' })).toBe(true);
    expect(m(await card('Llamada al Héroe'), { subtype: 'Contraataque' })).toBe(false);
    expect(m(await card('Relámpago'), { textIncludes: 'Héroe' })).toBe(false);
  });
});

describe('"Cuando es enviada al Cementerio" from anywhere, and where it came from', () => {
  it('Héroe Montado sent from the Mazo by Héroe de Marfil adds a Héroe Apoyo to the hand', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const llamada = await toDeckTop(state, 0, 'Llamada al Héroe');
    const montado = await toDeckTop(state, 0, 'Héroe Montado');
    const marfil = await toHand(state, 0, 'Héroe de Marfil');
    expect(applyAction(state, 0, { type: 'NORMAL_SUMMON', instanceId: marfil, position: 'attack' }).ok).toBe(true);
    let guard = 0;
    while (viewFor(state, 0).pendingTriggerChoice && guard++ < 5) {
      const pending = viewFor(state, 0).pendingTriggerChoice;
      const pick = pending.options.find((o) => o.instanceId === montado || o.instanceId === llamada) || pending.options[0];
      applyAction(state, 0, { type: 'RESOLVE_TRIGGER_CHOICE', targets: [pick.instanceId] });
    }
    expect(state.players[0].graveyard).toContain(montado);
    expect(state.players[0].hand).toContain(llamada);
  });

  it('Aboleth discarded from the hand does not summon its tokens ("del Campo al Cementerio")', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const aboleth = await toHand(state, 0, 'Aboleth');
    await toHand(state, 0, 'Slime'); // two cards: the player picks which one
    const { requestDiscard } = require('../../game/effects/actions');
    requestDiscard(state, 0, 1, 'Descarta');
    expect(applyAction(state, 0, { type: 'RESOLVE_TRIGGER_CHOICE', targets: [aboleth] }).ok).toBe(true);
    expect(state.players[0].graveyard).toContain(aboleth);
    expect(state.players[0].field.monsters.filter(Boolean)).toHaveLength(0);
    expect(viewFor(state, 0).pendingTriggerChoice).toBeNull();
  });
});

describe('Héroe de Escarcha as a material', () => {
  it('freezes a monster of the rival, never one of the player', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const escarcha = await onField(state, 0, 'Héroe de Escarcha');
    const mine = await onField(state, 0, 'Slime');
    const theirs = await onField(state, 1, 'Orco Guerrero');
    await onField(state, 1, 'Orco Gladiador');
    const { fireMaterialTriggers } = require('../../game/effectEngine');
    fireMaterialTriggers(state, 0, [escarcha], `0:${await idOf('Héroe Berserker')}:x`);
    const pending = viewFor(state, 0).pendingTriggerChoice;
    expect(pending.options.map((o) => o.instanceId)).not.toContain(mine);
    expect(applyAction(state, 0, { type: 'RESOLVE_TRIGGER_CHOICE', targets: [theirs] }).ok).toBe(true);
    expect(state.statuses[theirs].map((s) => s.type)).toContain('Congelado');
    expect(state.statuses[mine]).toBeUndefined();
  });
});

describe('Ciempiés Eterno', () => {
  it('is compiled from "Ciempiés Gigante" + 1 Insecto', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const eterno = await instance(0, 'Ciempiés Eterno');
    state.players[0].extra.push(eterno);
    const a = await onField(state, 0, 'Avispa gigante');
    await onField(state, 0, 'Avispa Rosa');
    const info = () => viewFor(state, 0).players[0].extra.find((c) => c.instanceId === eterno).compile;
    expect(info()).toMatchObject({ ready: false }); // two Insectos, but no Ciempiés Gigante
    const gigante = await onField(state, 0, 'Ciempiés Gigante');
    expect(info()).toMatchObject({ ready: true });
    expect(applyAction(state, 0, { type: 'COMPILE_SUMMON', instanceId: eterno, materialInstanceIds: [gigante, a] }).ok).toBe(true);
  });
});

describe('Enjambre de Avispas from the Cementerio', () => {
  it('with 3 Avispas there, the player picks which 2 go back', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const enjambre = await toGraveyard(state, 0, 'Enjambre de Avispas');
    const wasps = [await toGraveyard(state, 0, 'Avispa gigante'), await toGraveyard(state, 0, 'Avispa Rosa'), await toGraveyard(state, 0, 'Avispa Mutante')];
    expect(viewFor(state, 0).players[0].graveyard.find((c) => c.instanceId === enjambre).availableEffects).toContain('WASP_SWARM_GRAVE');
    const act = (targets) => applyAction(state, 0, { type: 'ACTIVATE_EFFECT', effectId: 'WASP_SWARM_GRAVE', sourceInstanceId: enjambre, targets });
    expect(act([])).toMatchObject({ ok: false, reason: 'choose-target', prompt: 'Elige los 2 monstruos "Avispa" de tu Cementerio que barajas en el Mazo' });
    expect(act([wasps[0], wasps[2]]).ok).toBe(true);
    passAll(state);
    expect(state.players[0].graveyard).toContain(wasps[1]);
    expect(state.players[0].deck).toEqual(expect.arrayContaining([wasps[0], wasps[2]]));
  });
});
