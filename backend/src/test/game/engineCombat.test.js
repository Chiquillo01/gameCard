// Attacks open a response window, battle events fire, and the flags effects set (extra attacks,
// direct attacks, "can't be targeted", "can't lose") are actually honored.
const { connectDB, disconnectDB } = require('../../mongo/connection');
const { applyAction, viewFor } = require('../../game/engine');
const { recomputeContinuous } = require('../../game/effectEngine');
const { placeSupport } = require('../../game/zones');
const { checkWin } = require('../../game/outcome');
const { seedCatalog, makeDuel, toHand, toDeckTop, onField, toPhase, passAll, monster, instance } = require('./engineHelpers');

beforeAll(async () => {
  await connectDB();
  await seedCatalog();
});

afterAll(async () => {
  await disconnectDB();
});

// Declaring only opens the response window; `attack` also lets both players pass so it resolves.
const declare = (state, p, attacker, target = null) => applyAction(state, p, { type: 'DECLARE_ATTACK', attackerInstanceId: attacker, targetInstanceId: target });
const attack = (state, p, attacker, target = null) => {
  const res = declare(state, p, attacker, target);
  if (res.ok) passAll(state);
  return res;
};

describe('Responding to an attack', () => {
  it('Trampa de Madera negates a direct attack and ends the Battle Phase', async () => {
    const state = await makeDuel();
    const attacker = await onField(state, 0, 'Orco Gladiador');
    const trampa = await toHand(state, 1, 'Trampa de Madera');
    toPhase(state, 'battle', 0);

    const res = declare(state, 0, attacker);
    expect(res).toMatchObject({ ok: true, responseWindow: true });
    expect(state.chain).toHaveLength(1);
    expect(state.priorityPlayer).toBe(1);
    expect(viewFor(state, 1).chain.links[0]).toMatchObject({ kind: 'attack' });

    expect(applyAction(state, 1, { type: 'ACTIVATE_SUPPORT', instanceId: trampa }).ok).toBe(true);
    passAll(state);
    expect(state.players[1].vp).toBe(80);
    expect(state.players[1].graveyard).toContain(trampa);
    expect(state.phase).toBe('main2');
  });

  it('Trampa de Madera cannot be used when no direct attack is happening', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const trampa = await toHand(state, 0, 'Trampa de Madera');
    expect(applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: trampa })).toMatchObject({ ok: false, reason: 'no-response-window' });
  });

  it('the window opens even when the defender holds nothing (so it gives nothing away); passing lets the attack through', async () => {
    const state = await makeDuel();
    const attacker = await onField(state, 0, 'Orco Gladiador');
    toPhase(state, 'battle', 0);
    expect(declare(state, 0, attacker)).toMatchObject({ ok: true, responseWindow: true });
    expect(state.chain).toHaveLength(1);
    expect(state.priorityPlayer).toBe(1);
    expect(state.players[1].vp).toBe(80);
    // Declaring already counts as the attacker's pass: one pass from the defender resolves it.
    expect(applyAction(state, 1, { type: 'PASS_CHAIN' }).ok).toBe(true);
    expect(state.chain).toHaveLength(0);
    expect(state.players[1].vp).toBe(80 - 3);
  });
});

describe('Battle events', () => {
  it('Matón: destroying a monster in battle summons a "Matón" from the Mazo', async () => {
    const state = await makeDuel();
    const maton = await onField(state, 0, 'Matón');
    const slime = await onField(state, 1, 'Slime');
    toPhase(state, 'battle', 0);
    const second = await toDeckTop(state, 0, 'Matón'); // after the turn's draws
    attack(state, 0, maton, slime);
    expect(monster(state, slime)).toBeUndefined();
    expect(monster(state, second)).toBeDefined();
  });

  it('Gárgola: destroyed in battle, it summons a "Gárgola" from the Mazo', async () => {
    const state = await makeDuel();
    const orco = await onField(state, 0, 'Orco Gladiador');
    const gargola = await onField(state, 1, 'Gárgola');
    toPhase(state, 'battle', 0);
    const next = await toDeckTop(state, 1, 'Gárgola');
    attack(state, 0, orco, gargola);
    expect(state.players[1].graveyard).toContain(gargola);
    expect(monster(state, next)).toBeDefined();
  });

  it('Pez Leviatán: when a Pez is destroyed, the rival discards a card at random', async () => {
    const state = await makeDuel();
    const orco = await onField(state, 0, 'Orco Gladiador');
    const pez = await onField(state, 1, 'Pez Leviatán');
    await toHand(state, 0, 'Slime');
    await toHand(state, 0, 'Chispa');
    toPhase(state, 'battle', 0);
    const hand = state.players[0].hand.length;
    attack(state, 0, orco, pez);
    expect(state.players[0].hand.length).toBe(hand - 1);
  });

  it('Acechador Invisible attacks directly past a rival monster and gains +2 Atk when it deals damage', async () => {
    const state = await makeDuel();
    const acechador = await onField(state, 0, 'Acechador Invisible');
    await onField(state, 1, 'Slime');
    toPhase(state, 'battle', 0);
    expect(attack(state, 0, acechador)).toMatchObject({ ok: true });
    expect(state.players[1].vp).toBe(80 - 1);
    expect(monster(state, acechador).baseAtk).toBe(1 + 2);
  });

  it('Esqueleto de relámpago: after it deals damage, the rival discards a card of their choice', async () => {
    const state = await makeDuel();
    const esqueleto = await onField(state, 0, 'Esqueleto de relámpago');
    const a = await toHand(state, 1, 'Slime');
    await toHand(state, 1, 'Valkiria');
    toPhase(state, 'battle', 0);
    attack(state, 0, esqueleto);
    const pending = viewFor(state, 1).pendingTriggerChoice;
    expect(pending).toMatchObject({ kind: 'discard', count: 1 });
    expect(viewFor(state, 0).pendingTriggerChoice).toBeNull();
    expect(applyAction(state, 1, { type: 'RESOLVE_TRIGGER_CHOICE', targets: [a] }).ok).toBe(true);
    expect(state.players[1].graveyard).toContain(a);
  });

  it('Serpiente de Muelle: before damage, it and the defender go back to their hands', async () => {
    const state = await makeDuel();
    const serpiente = await onField(state, 0, 'Serpiente de Muelle');
    const slime = await onField(state, 1, 'Slime');
    toPhase(state, 'battle', 0);
    attack(state, 0, serpiente, slime);
    expect(state.players[0].hand).toContain(serpiente);
    expect(state.players[1].hand).toContain(slime);
    expect(state.players[1].vp).toBe(80);
  });

  it('Relicario de Engranaje gains an Engranaje when a TIERRA monster of yours deals direct damage', async () => {
    const state = await makeDuel();
    const relicarioId = await instance(0, 'Relicario de Engranaje');
    const relicario = placeSupport(state, relicarioId, 0, { faceDown: false });
    const orco = await onField(state, 0, 'Orco Gladiador'); // TIERRA
    toPhase(state, 'battle', 0);
    attack(state, 0, orco);
    expect(relicario.counters).toEqual({ gear: 1 });
  });

  it('Gigante Elemental wins the duel when it deals direct damage', async () => {
    const state = await makeDuel();
    const gigante = await onField(state, 0, 'Gigante Elemental');
    toPhase(state, 'battle', 0);
    attack(state, 0, gigante);
    expect(state).toMatchObject({ status: 'finished', winnerIndex: 0 });
  });
});

describe('Flags effects set are honored', () => {
  it('Bálor: its extra attack lets it attack twice that turn', async () => {
    const state = await makeDuel();
    const balor = await onField(state, 0, 'Bálor');
    toPhase(state, 'main1', 0);
    toPhase(state, 'main1', 1);
    toPhase(state, 'main1', 0); // turn 3: this turn has a Battle Phase
    expect(applyAction(state, 0, { type: 'ACTIVATE_EFFECT', effectId: 'BALOR_EXTRA_ATTACK', sourceInstanceId: balor }).ok).toBe(true);
    passAll(state);
    applyAction(state, 0, { type: 'ADVANCE_PHASE' });
    expect(attack(state, 0, balor).ok).toBe(true);
    expect(attack(state, 0, balor).ok).toBe(true);
    expect(attack(state, 0, balor)).toMatchObject({ ok: false, reason: 'already-attacked' });
    // Two direct hits of 11, plus its own "En cada fase de espera: inflige 3 VP" in turns 1-3.
    expect(state.players[1].vp).toBe(80 - 3 * 3 - 22);
  });

  it('Damarco attacks once more per material under it', async () => {
    const state = await makeDuel();
    const damarco = await onField(state, 0, 'Damarco, licántropo luchador');
    monster(state, damarco).materials = [await instance(0, 'Licántropo Beta'), await instance(0, 'Licántropo Cazador')];
    recomputeContinuous(state);
    const { allowedAttacks } = require('../../game/combat');
    expect(allowedAttacks(state, monster(state, damarco))).toBe(3);
  });

  it('Homúnculo: the equipped monster can attack directly even when the rival has monsters', async () => {
    const state = await makeDuel();
    const orco = await onField(state, 0, 'Orco Gladiador');
    await onField(state, 1, 'Slime');
    toPhase(state, 'battle', 0);
    expect(attack(state, 0, orco)).toMatchObject({ ok: false, reason: 'must-target-a-monster' });
    const homunculo = placeSupport(state, await instance(0, 'Homúnculo'), 0, { faceDown: false });
    homunculo.equippedTo = orco;
    recomputeContinuous(state);
    expect(attack(state, 0, orco)).toMatchObject({ ok: true });
    expect(state.players[1].vp).toBe(80 - 3);
  });

  it('Motor de Engranaje with an Engranaje cannot be attacked', async () => {
    const state = await makeDuel();
    const orco = await onField(state, 0, 'Orco Gladiador');
    const motor = await onField(state, 1, 'Motor de Engranaje');
    monster(state, motor).counters = { gear: 1 };
    recomputeContinuous(state);
    toPhase(state, 'battle', 0);
    expect(attack(state, 0, orco, motor)).toMatchObject({ ok: false, reason: 'cannot-be-targeted' });
    expect(attack(state, 0, orco)).toMatchObject({ ok: true }); // nothing it can target, so directly
  });

  it('Ángel de Platino: its controller cannot lose while it is on the field', async () => {
    const state = await makeDuel();
    placeSupport(state, await instance(0, 'Ángel de Platino'), 0, { faceDown: false });
    recomputeContinuous(state);
    state.players[0].vp = 0;
    checkWin(state);
    expect(state.status).toBe('active');
  });

  it('Paseo Temporal: no attacks this turn, and the same player takes the next turn', async () => {
    const state = await makeDuel();
    const orco = await onField(state, 0, 'Orco Gladiador');
    toPhase(state, 'main1', 0);
    toPhase(state, 'main1', 1);
    toPhase(state, 'main1', 0);
    const paseo = await toHand(state, 0, 'Paseo Temporal');
    expect(applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: paseo }).ok).toBe(true);
    passAll(state);
    applyAction(state, 0, { type: 'ADVANCE_PHASE' });
    expect(attack(state, 0, orco)).toMatchObject({ ok: false, reason: 'attacks-disabled' });
    const turn = state.turnNumber;
    toPhase(state, 'end', 0);
    applyAction(state, 0, { type: 'ADVANCE_PHASE' });
    expect(state.turnNumber).toBe(turn + 1);
    expect(state.turnPlayer).toBe(0);
  });
});

describe('Timing', () => {
  it('the rival cannot start a Speed 1 effect during your turn, nor you outside your Fase Principal', async () => {
    const state = await makeDuel();
    const theirs = await onField(state, 1, 'Cubo Gelatinoso');
    const mine = await onField(state, 0, 'Cubo Gelatinoso');
    await onField(state, 0, 'Slime');
    toPhase(state, 'main1', 0);
    expect(applyAction(state, 1, { type: 'ACTIVATE_EFFECT', effectId: 'CUBO_GELATINOSO_NEGATE', sourceInstanceId: theirs })).toMatchObject({ ok: false, reason: 'not-your-turn' });
    toPhase(state, 'main1', 1);
    toPhase(state, 'battle', 0);
    expect(applyAction(state, 0, { type: 'ACTIVATE_EFFECT', effectId: 'CUBO_GELATINOSO_NEGATE', sourceInstanceId: mine })).toMatchObject({ ok: false, reason: 'not-main-phase' });
  });
});
