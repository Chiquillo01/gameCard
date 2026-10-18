// AdB cards programmed from the final card list: the Safira line, Draco, Grifo, Hipogrifo, Mantícora
// and Viaje de Unión.
const { connectDB, disconnectDB } = require('../../mongo/connection');
const { applyAction, viewFor } = require('../../game/engine');
const { recomputeContinuous, getEffectiveStats } = require('../../game/effectEngine');
const { placeSupport } = require('../../game/zones');
const { matchesCardFilter } = require('../../game/filters');
const { getCard, getEffect } = require('../../game/cardIndex');
const { selectRows } = require('../../game/targets');
const { seedCatalog, makeDuel, instance, toHand, toDeckTop, toGraveyard, onField, toPhase, passAll, monster, idOf } = require('./engineHelpers');
const { placePending } = require('./chainHelpers');

beforeAll(async () => {
  await connectDB();
  await seedCatalog();
});

afterAll(async () => {
  await disconnectDB();
});

// Answers every pending choice with its first option (or the one `pick` prefers).
const resolveChoices = (state, p, pick = () => null) => {
  let guard = 0;
  while (guard++ < 10) {
    const pending = viewFor(state, p).pendingTriggerChoice;
    if (!pending) break;
    if (pending.kind === 'slot') { placePending(state); continue; }
    const choice = pick(pending) || pending.options[0].instanceId;
    applyAction(state, p, { type: 'RESOLVE_TRIGGER_CHOICE', targets: [choice] });
    passAll(state);
    placePending(state);
  }
};

describe('Safira', () => {
  it('Bebé Dragón becomes la Joven Heredera in its owner\'s next Fase de Espera (not the rival\'s); the Joven turns a rival monster face down', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const bebe = await onField(state, 0, 'Safira, Bebé Dragón');
    const joven = await toDeckTop(state, 0, 'Safira, la Joven Heredera');
    const slime = await onField(state, 1, 'Slime');
    toPhase(state, 'main1', 1); // the rival's turn: nothing yet
    expect(monster(state, bebe)).toBeDefined();
    let guard = 0;
    while (!(state.turnPlayer === 0 && state.phase === 'main1') && guard++ < 20) {
      applyAction(state, state.turnPlayer, { type: 'ADVANCE_PHASE' });
      resolveChoices(state, 0, (pending) => (pending.options.find((o) => o.instanceId === slime) || {}).instanceId);
    }
    expect(monster(state, bebe)).toBeUndefined();
    expect(state.players[0].graveyard).toContain(bebe);
    expect(monster(state, joven)).toBeDefined();
    expect(monster(state, slime)).toMatchObject({ position: 'defense', faceDown: true });
  });

  it('can\'t be picked by a monster\'s effect unless it is a Dragón; supports can', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const bebe = await onField(state, 1, 'Safira, Bebé Dragón');
    recomputeContinuous(state);
    const offered = (source) => selectRows({ state, controllerIndex: 0, sourceInstanceId: source }, { target: 'selected', zone: 'monster', side: 'opponent' }).map((r) => r.entry.instanceId);
    expect(offered(await onField(state, 0, 'Cactus Violento'))).not.toContain(bebe);
    expect(offered(await onField(state, 0, 'Dragón de Fuego Bebe'))).toContain(bebe);
    expect(offered(await toHand(state, 0, 'Relámpago'))).toContain(bebe);
  });

  it('la Reina Dragón puts every rival monster face down and locks them; Dragón monsters gain +2 Atk/Vida', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 1);
    const rival = [await onField(state, 1, 'Slime'), await onField(state, 1, 'Kraken')];
    toPhase(state, 'main1', 0);
    const reina = await toDeckTop(state, 0, 'Safira, la Reina Dragón');
    const real = await onField(state, 0, 'Safira, la Dragóna Real');
    monster(state, real).summonedTurn = state.turnNumber - 2;
    // Through the Dragóna Real's own evolution, so it's an effect's special summon.
    toPhase(state, 'main1', 1);
    let guard = 0;
    while (!(state.turnPlayer === 0 && state.phase === 'main1') && guard++ < 20) {
      applyAction(state, state.turnPlayer, { type: 'ADVANCE_PHASE' });
      resolveChoices(state, 0);
    }
    expect(monster(state, reina)).toBeDefined();
    rival.forEach((id) => expect(monster(state, id)).toMatchObject({ position: 'defense', faceDown: true, positionLocked: true }));
    toPhase(state, 'main1', 1);
    expect(applyAction(state, 1, { type: 'CHANGE_POSITION', instanceId: rival[0], position: 'attack' })).toMatchObject({ ok: false, reason: 'position-locked' });
    const baby = await onField(state, 1, 'Dragón de Fuego Bebe');
    recomputeContinuous(state);
    const card = getCard(monster(state, baby).cardId);
    expect(getEffectiveStats(monster(state, baby))).toEqual({ atk: card.atk + 2, def: card.def + 2 });
  });
});

describe('El Jinete Original, Draco', () => {
  it('counts as a Dragón anywhere, and gives your Dragones +2 Atk per Dragón on the field', async () => {
    expect(matchesCardFilter(getCard(await idOf('El Jinete Original, Draco')), { breed: 'Dragón' })).toBe(true);
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const draco = await onField(state, 0, 'El Jinete Original, Draco');
    const baby = await onField(state, 0, 'Dragón de Fuego Bebe');
    await onField(state, 1, 'Dragón de Tierra Bebe');
    recomputeContinuous(state);
    // 3 Dragones on the field (Draco is one): +6 each to the player's own.
    expect(monster(state, baby).tempBuff.atk).toBe(6);
    expect(monster(state, draco).tempBuff.atk).toBe(6);
  });
});

describe('Grifo / Hipogrifo', () => {
  it('Grifo, Normal Summoned, brings out a Bestia from the hand and gains its Atk and Vida', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const grifo = await toHand(state, 0, 'Grifo');
    const beast = await toHand(state, 0, 'Dragón de Fuego Bebe');
    expect(applyAction(state, 0, { type: 'NORMAL_SUMMON', instanceId: grifo }).ok).toBe(true);
    resolveChoices(state, 0, (pending) => (pending.options.find((o) => o.instanceId === beast) || {}).instanceId);
    passAll(state);
    placePending(state);
    expect(monster(state, beast)).toBeDefined();
    const g = getCard(monster(state, grifo).cardId);
    const b = getCard(monster(state, beast).cardId);
    expect(monster(state, grifo)).toMatchObject({ baseAtk: g.atk + b.atk, baseDef: g.def + b.def });
  });

  it('Hipogrifo does it from the Cementerio', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const hipo = await toHand(state, 0, 'Hipogrifo');
    const beast = await toGraveyard(state, 0, 'Dragón de Tierra Bebe');
    expect(applyAction(state, 0, { type: 'NORMAL_SUMMON', instanceId: hipo }).ok).toBe(true);
    resolveChoices(state, 0, (pending) => (pending.options.find((o) => o.instanceId === beast) || {}).instanceId);
    passAll(state);
    placePending(state);
    expect(monster(state, beast)).toBeDefined();
    const h = getCard(monster(state, hipo).cardId);
    expect(monster(state, hipo).baseAtk).toBe(h.atk + getCard(monster(state, beast).cardId).atk);
  });
});

describe('Mantícora', () => {
  it('doubles the gains of the Bestias on its side, and while there is another Bestia it can\'t be destroyed', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 1);
    const manticora = await onField(state, 1, 'Mantícora');
    const relampago = async () => {
      const card = await toHand(state, 0, 'Relámpago');
      return applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: card, targets: [manticora] });
    };
    toPhase(state, 'main1', 0);
    expect((await relampago()).ok).toBe(true);
    passAll(state);
    expect(monster(state, manticora)).toBeUndefined(); // alone: no protection

    const state2 = await makeDuel();
    toPhase(state2, 'main1', 1);
    const m2 = await onField(state2, 1, 'Mantícora');
    const baby = await onField(state2, 1, 'Dragón de Fuego Bebe'); // a Bestia (Dragón)
    placeSupport(state2, await instance(1, 'Templo del Dragón'), 1, { faceDown: false });
    recomputeContinuous(state2);
    expect(monster(state2, baby).tempBuff).toEqual({ atk: 2, def: 2 }); // Templo's +1/+1, doubled
    toPhase(state2, 'main1', 0);
    const card = await toHand(state2, 0, 'Relámpago');
    expect(applyAction(state2, 0, { type: 'ACTIVATE_SUPPORT', instanceId: card, targets: [m2] }).ok).toBe(true);
    passAll(state2);
    expect(monster(state2, m2)).toBeDefined();
  });
});

describe('Viaje de Unión', () => {
  it('for the rest of the turn, each time the rival adds a card from their Mazo, its owner draws 1', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 1);
    const viaje = placeSupport(state, await instance(0, 'Viaje de Unión'), 0, { faceDown: true }).instanceId;
    state.players[0].field.support.find((s) => s && s.instanceId === viaje).setTurn = state.turnNumber - 1; // set in an earlier turn
    const before = state.players[0].hand.length;
    // The rival searches; Viaje de Unión answers it, so it resolves first.
    const maestro = await toHand(state, 1, 'Maestro de Dragones');
    const dragon = await toDeckTop(state, 1, 'Dragón de Fuego Bebe');
    let res = applyAction(state, 1, { type: 'ACTIVATE_EFFECT', effectId: 'MASTER_DRAGONS_SEARCH', sourceInstanceId: maestro });
    if (res.reason === 'choose-target') res = applyAction(state, 1, { type: 'ACTIVATE_EFFECT', effectId: 'MASTER_DRAGONS_SEARCH', sourceInstanceId: maestro, targets: [dragon] });
    expect(res.ok).toBe(true);
    const act = applyAction(state, 0, { type: 'ACTIVATE_EFFECT', effectId: 'VIAJE_UNION_DRAW_ON_SEARCH', sourceInstanceId: viaje });
    expect(act.reason || 'ok').toBe('ok');
    passAll(state);
    expect(state.players[1].hand).toContain(dragon);
    expect(state.players[0].hand.length).toBe(before + 1);
  });
});

describe('Basilisco', () => {
  it('in its controller\'s Battle Phase, the rival\'s monsters lose 1 Atk per monster the rival controls', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 1);
    const rival = [await onField(state, 1, 'Kraken'), await onField(state, 1, 'Orco Guerrero')];
    toPhase(state, 'main1', 0);
    await onField(state, 0, 'Basilisco');
    const before = rival.map((id) => getEffectiveStats(monster(state, id)).atk);
    toPhase(state, 'battle', 0);
    passAll(state);
    recomputeContinuous(state);
    rival.forEach((id, i) => expect(getEffectiveStats(monster(state, id)).atk).toBe(Math.max(0, before[i] - 2)));
  });
});

describe('Anillo de Boda from the Cementerio', () => {
  it('for the rest of the turn, when the rival destroys a monster of yours, they destroy one of their own (their pick)', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 1);
    const anillo = await toGraveyard(state, 0, 'Anillo de Boda');
    const mine = await onField(state, 0, 'Kraken');
    const theirs = [await onField(state, 1, 'Slime'), await onField(state, 1, 'Orco Guerrero')];
    const relampago = await toHand(state, 1, 'Relámpago');
    expect(applyAction(state, 1, { type: 'ACTIVATE_SUPPORT', instanceId: relampago, targets: [mine] }).ok).toBe(true);
    // Answered from the Cementerio, so it resolves before the Relámpago.
    expect(applyAction(state, 0, { type: 'ACTIVATE_EFFECT', effectId: 'ANILLO_BODA_CEMENTERIO', sourceInstanceId: anillo }).ok).toBe(true);
    passAll(state);
    expect(state.players[0].banished).toContain(anillo);
    expect(monster(state, mine)).toBeUndefined();
    const pending = viewFor(state, 1).pendingTriggerChoice;
    expect(pending.options.map((o) => o.instanceId).sort()).toEqual([...theirs].sort());
    expect(applyAction(state, 1, { type: 'RESOLVE_TRIGGER_CHOICE', targets: [theirs[1]] }).ok).toBe(true);
    expect(monster(state, theirs[1])).toBeUndefined();
    expect(monster(state, theirs[0])).toBeDefined();
  });
});

describe('El Primer Ginete', () => {
  it('gives every Dragón on the field, on both sides, +1 Atk per Dragón on the field', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    await onField(state, 0, 'El Primer Ginete');
    const mine = await onField(state, 0, 'Dragón de Fuego Bebe');
    const theirs = await onField(state, 1, 'Dragón de Tierra Bebe');
    recomputeContinuous(state);
    expect(monster(state, mine).tempBuff.atk).toBe(2);
    expect(monster(state, theirs).tempBuff.atk).toBe(2);
  });
});

describe('The four big dragons: "puedes activar el siguiente efecto"', () => {
  it('Sky, special summoned, asks whether to search; saying no leaves the Mazo alone', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const sky = await toHand(state, 0, 'Sky, el Dragón de Viento');
    await toHand(state, 0, 'Dragón de Fuego Bebe');
    await toHand(state, 0, 'Dragón de Tierra Bebe');
    await toDeckTop(state, 0, 'Dragón de Viento Bebe');
    const hand = () => state.players[0].hand.length;
    let res = applyAction(state, 0, { type: 'SPECIAL_SUMMON', instanceId: sky });
    let guard = 0;
    while (res.reason === 'choose-target' && guard++ < 4) res = applyAction(state, 0, { type: 'SPECIAL_SUMMON', instanceId: sky, targets: res.options.slice(0, 2).map((o) => o.instanceId) });
    expect(res.ok).toBe(true);
    placePending(state);
    const pending = viewFor(state, 0).pendingTriggerChoice;
    expect(pending.options.map((o) => o.instanceId)).toEqual(['optional:yes', 'optional:no']);
    const before = hand();
    applyAction(state, 0, { type: 'RESOLVE_TRIGGER_CHOICE', targets: ['optional:no'] });
    passAll(state);
    expect(hand()).toBe(before);
  });
});

describe('The four big dragons: "desde la Mano o Cementerio"', () => {
  it('Oscuro can be special summoned from the Cementerio by discarding 2 Dragones', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const oscuro = await toGraveyard(state, 0, 'Oscuro, el Dragón de Oscuridad');
    const payers = [await toHand(state, 0, 'Dragón de Fuego Bebe'), await toHand(state, 0, 'Dragón de Tierra Bebe')];
    expect(viewFor(state, 0).players[0].graveyard.find((c) => c.instanceId === oscuro)).toMatchObject({ specialSummonAvailable: true });
    let res = applyAction(state, 0, { type: 'SPECIAL_SUMMON', instanceId: oscuro });
    if (res.reason === 'choose-target') res = applyAction(state, 0, { type: 'SPECIAL_SUMMON', instanceId: oscuro, targets: payers });
    expect(res.ok).toBe(true);
    expect(monster(state, oscuro)).toBeDefined();
    payers.forEach((id) => expect(state.players[0].graveyard).toContain(id));
  });
});
