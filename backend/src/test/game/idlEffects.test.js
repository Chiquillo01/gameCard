// IdL cards programmed from the final list (and the flip effects resolving inside a battle).
const { connectDB, disconnectDB } = require('../../mongo/connection');
const { applyAction, viewFor } = require('../../game/engine');
const { getEffectiveStats } = require('../../game/effectEngine');
const { seedCatalog, makeDuel, toHand, toDeckTop, toGraveyard, onField, toPhase, passAll, monster } = require('./engineHelpers');
const { placePending } = require('./chainHelpers');

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
  while (guard++ < 15) {
    const pending = state.pendingTriggerChoices && state.pendingTriggerChoices[0];
    if (!pending) return;
    if (pending.kind === 'slot') { applyAction(state, pending.controllerIndex, { type: 'RESOLVE_TRIGGER_CHOICE', slot: pending.slots[0] }); sent = []; continue; }
    const p = pending.controllerIndex;
    const view = viewFor(state, p).pendingTriggerChoice;
    const next = picks.find((id) => view.options.some((o) => o.instanceId === id) && !sent.includes(id)) || view.options[0].instanceId;
    sent = [...sent, next];
    const res = applyAction(state, p, { type: 'RESOLVE_TRIGGER_CHOICE', targets: sent });
    if (res.reason !== 'choose-target') { sent = []; passAll(state); }
  }
};

describe('Flip effects in battle (Al modificar su posición de boca abajo a boca arriba)', () => {
  it('attacked face-down, Contenedor sospechoso is turned over and returns the attacker to the hand before the damage', async () => {
    const state = await makeDuel();
    const contenedor = await onField(state, 1, 'Contenedor sospechoso', { position: 'defense', faceDown: true });
    const attacker = await onField(state, 0, 'Orco Guerrero');
    toPhase(state, 'battle', 0);
    expect(applyAction(state, 0, { type: 'DECLARE_ATTACK', attackerInstanceId: attacker, targetInstanceId: contenedor }).ok).toBe(true);
    passAll(state);
    answer(state, [attacker]);
    expect(state.players[0].hand).toContain(attacker);
    expect(monster(state, contenedor)).toMatchObject({ faceDown: false });
  });

  it('Recipiente Engañoso, attacked face-down, sends the top 2 cards of the rival\'s Mazo to the Cementerio', async () => {
    const state = await makeDuel();
    const recipiente = await onField(state, 1, 'Recipiente Engañoso', { position: 'defense', faceDown: true });
    const attacker = await onField(state, 0, 'Orco Guerrero');
    toPhase(state, 'battle', 0);
    const gy = state.players[0].graveyard.length;
    expect(applyAction(state, 0, { type: 'DECLARE_ATTACK', attackerInstanceId: attacker, targetInstanceId: recipiente }).ok).toBe(true);
    passAll(state);
    expect(state.players[0].graveyard.length).toBe(gy + 2);
  });
});

describe('El Vacío / Sombra', () => {
  it('El Vacío exiles every monster on the field', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const a = await onField(state, 0, 'Slime');
    const b = await onField(state, 1, 'Kraken');
    const card = await toHand(state, 0, 'El Vacío');
    state.players[0].pixelcoins = 5;
    expect(applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: card }).ok).toBe(true);
    passAll(state);
    expect(state.players[0].banished).toContain(a);
    expect(state.players[1].banished).toContain(b);
  });

  it('Sombra destroys every monster and leaves a Ficha Sombra 1/1 in each zone', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const a = await onField(state, 0, 'Slime');
    const b = await onField(state, 1, 'Kraken');
    const slotA = state.players[0].field.monsters.findIndex((m) => m && m.instanceId === a);
    const slotB = state.players[1].field.monsters.findIndex((m) => m && m.instanceId === b);
    const card = await toHand(state, 0, 'Sombra');
    state.players[0].pixelcoins = 5;
    expect(applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: card }).ok).toBe(true);
    passAll(state);
    expect(state.players[0].graveyard).toContain(a);
    expect(state.players[1].graveyard).toContain(b);
    expect(state.players[0].field.monsters[slotA]).toMatchObject({ isToken: true, tokenDef: { name: 'Ficha Sombra' }, baseAtk: 1, baseDef: 1 });
    expect(state.players[1].field.monsters[slotB]).toMatchObject({ isToken: true, tokenDef: { name: 'Ficha Sombra' } });
  });
});

describe('Can del Infierno', () => {
  it('is special summoned by sacrificing a monster; once per turn 5 VP to the rival', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const can = await toHand(state, 0, 'Can del Infierno');
    expect(applyAction(state, 0, { type: 'NORMAL_SUMMON', instanceId: can }).ok).toBe(false);
    const fodder = await onField(state, 0, 'Slime');
    let res = applyAction(state, 0, { type: 'SPECIAL_SUMMON', instanceId: can });
    if (res.reason === 'choose-target') res = applyAction(state, 0, { type: 'SPECIAL_SUMMON', instanceId: can, targets: [fodder] });
    expect(res.ok).toBe(true);
    placePending(state);
    expect(state.players[0].graveyard).toContain(fodder);
    expect(monster(state, can)).toBeDefined();
    const vp = state.players[1].vp;
    expect(applyAction(state, 0, { type: 'ACTIVATE_EFFECT', effectId: 'CAN_INFIERNO_CHOICE', sourceInstanceId: can, targets: ['choice:0'] }).ok).toBe(true);
    passAll(state);
    expect(state.players[1].vp).toBe(vp - 5);
    expect(applyAction(state, 0, { type: 'ACTIVATE_EFFECT', effectId: 'CAN_INFIERNO_CHOICE', sourceInstanceId: can, targets: ['choice:0'] }).ok).toBe(false);
  });
});

describe('Sátiro Vengador', () => {
  it('once per turn recovers VP equal to the Atk of an Hada in its Cementerio', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const satiro = await onField(state, 0, 'Sátiro Vengador');
    const planetar = await toGraveyard(state, 0, 'Planetar');
    const vp = state.players[0].vp;
    expect(applyAction(state, 0, { type: 'ACTIVATE_EFFECT', effectId: 'SATIRO_VENGADOR_VP', sourceInstanceId: satiro, targets: [planetar] }).ok).toBe(true);
    passAll(state);
    expect(state.players[0].vp).toBe(vp + 5); // Planetar: Atk 5
    expect(applyAction(state, 0, { type: 'ACTIVATE_EFFECT', effectId: 'SATIRO_VENGADOR_VP', sourceInstanceId: satiro, targets: [planetar] }).ok).toBe(false);
  });
});

describe('La Virtud del Más Débil', () => {
  it('only goes on a 0 Atk monster; attacked, that monster gets the attacker\'s Atk', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 1);
    const weak = await onField(state, 1, 'Contenedor sospechoso'); // Atk 0
    await onField(state, 1, 'Kraken');
    const virtud = await toHand(state, 1, 'La Virtud del Más Débil');
    state.players[1].pixelcoins = 10;
    expect(applyAction(state, 1, { type: 'ACTIVATE_SUPPORT', instanceId: virtud }).ok).toBe(true); // only the Contenedor can take it
    passAll(state);
    expect(state.players[1].field.support.find((s) => s && s.instanceId === virtud).equippedTo).toBe(weak);
    const attacker = await onField(state, 0, 'Orco Guerrero');
    toPhase(state, 'battle', 0);
    const orcoAtk = getEffectiveStats(monster(state, attacker)).atk;
    expect(applyAction(state, 0, { type: 'DECLARE_ATTACK', attackerInstanceId: attacker, targetInstanceId: weak }).ok).toBe(true);
    passAll(state);
    answer(state);
    expect(state.lastBattle.steps.some((s) => s.includes(`Atk ${orcoAtk} con Atk ${orcoAtk}`))).toBe(true);
  });
});

describe('Hoguera', () => {
  it('searches a Fuego or Lava monster; from the Cementerio shuffles 2 of them back and draws', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const can = await toDeckTop(state, 0, 'Can del Infierno'); // Fuego
    const hoguera = await toHand(state, 0, 'Hoguera');
    state.players[0].pixelcoins = 10;
    let res = applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: hoguera });
    if (res.reason === 'choose-target') res = applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: hoguera, targets: [can] });
    expect(res.ok).toBe(true);
    passAll(state);
    answer(state, [can]);
    expect(state.players[0].hand).toContain(can);

    state.graveyardTurn = state.graveyardTurn || {};
    const f1 = await toGraveyard(state, 0, 'Can del Infierno');
    const f2 = await toGraveyard(state, 0, 'Rey Demonio'); // Fuego
    const hand = state.players[0].hand.length;
    expect(applyAction(state, 0, { type: 'ACTIVATE_EFFECT', effectId: 'HOGUERA_GY_RECYCLE', sourceInstanceId: hoguera, targets: [f1, f2] }).ok).toBe(true);
    passAll(state);
    expect(state.players[0].banished).toContain(hoguera);
    expect(state.players[0].graveyard).not.toContain(f1);
    expect(state.players[0].hand.length).toBe(hand + 1);
  });
});

describe('Special summons: the player picks attack or defense', () => {
  it('by its own method (Vampiro): asked before anything else, and it can land in face-up defense', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const vampiro = await toHand(state, 0, 'Vampiro');
    await toGraveyard(state, 0, 'Murciélago');
    expect(applyAction(state, 0, { type: 'SPECIAL_SUMMON', instanceId: vampiro }).ok).toBe(true);
    const ask = viewFor(state, 0).pendingTriggerChoice;
    expect(ask.options.map((o) => o.instanceId)).toEqual(['position:attack', 'position:defense']);
    expect(applyAction(state, 0, { type: 'NORMAL_SUMMON', instanceId: await toHand(state, 0, 'Slime'), position: 'attack' }).ok).toBe(false);
    expect(applyAction(state, 0, { type: 'RESOLVE_TRIGGER_CHOICE', targets: ['position:defense'] }).ok).toBe(true);
    expect(monster(state, vampiro)).toMatchObject({ position: 'defense', faceDown: false });
  });

  it('by an effect (Planetar\'s Hada from the Cementerio) the player picks too', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const valkiria = await toGraveyard(state, 0, 'Valkiria');
    const planetar = await toHand(state, 0, 'Planetar');
    expect(applyAction(state, 0, { type: 'NORMAL_SUMMON', instanceId: planetar, position: 'attack' }).ok).toBe(true);
    answer(state, ['choice:0', 'position:defense']);
    expect(monster(state, valkiria)).toMatchObject({ position: 'defense' });
  });

  it('unless the card says the position (Orco Jefe: "en posición de ataque")', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const jefe = await onField(state, 0, 'Orco Jefe');
    const grokkar = await toDeckTop(state, 0, 'Goblin Guardián');
    let res = applyAction(state, 0, { type: 'ACTIVATE_EFFECT', effectId: 'ORCO_JEFE_SUMMON_GROKKAR', sourceInstanceId: jefe });
    if (res.reason === 'choose-target') res = applyAction(state, 0, { type: 'ACTIVATE_EFFECT', effectId: 'ORCO_JEFE_SUMMON_GROKKAR', sourceInstanceId: jefe, targets: [grokkar] });
    expect(res.ok).toBe(true);
    passAll(state);
    placePending(state);
    expect(monster(state, grokkar)).toMatchObject({ position: 'attack' });
    expect((state.pendingTriggerChoices || []).some((p) => p.kind === 'position')).toBe(false);
  });
});
