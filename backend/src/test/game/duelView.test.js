// What the board receives: current vs printed Atk/Vida with where each change came from, the last
// battle step by step, player names in the log and readable labels for the effect buttons.
const { connectDB, disconnectDB } = require('../../mongo/connection');
const { applyAction, viewFor } = require('../../game/engine');
const { recomputeContinuous } = require('../../game/effectEngine');
const { placeSupport } = require('../../game/zones');
const { seedCatalog, makeDuel, onField, toPhase, passAll, instance } = require('./engineHelpers');

beforeAll(async () => {
  await connectDB();
  await seedCatalog();
});

afterAll(async () => {
  await disconnectDB();
});

const fieldView = (state, viewer, id) => viewFor(state, viewer).players.flatMap((p) => p.field.monsters).find((m) => m && m.instanceId === id);

describe('Duel view: Atk/Vida changes', () => {
  it('shows the printed and current Atk with each change and its source, to both players', async () => {
    const state = await makeDuel();
    const orco = await onField(state, 0, 'Orco Guerrero');
    const armadura = placeSupport(state, await instance(0, 'Armadura del poder'), 0, { faceDown: false });
    armadura.equippedTo = orco;
    recomputeContinuous(state);

    expect(fieldView(state, 0, orco)).toMatchObject({
      printedAtk: 3,
      atk: 4,
      equips: ['Armadura del poder'],
      statMods: [{ source: 'Armadura del poder', atk: 1, def: 0, kind: 'continuous' }],
    });

    // Another Orco Guerrero's '+2 Atk' is a one-off: it stays (permanent) and gets a log line.
    toPhase(state, 'main1', 0);
    const own = fieldView(state, 0, orco);
    expect(own.effectLabels.ORCO_GUERRERO_BUFF).toBe('+2 Atk');
    const source = await onField(state, 0, 'Orco Guerrero');
    expect(applyAction(state, 0, { type: 'ACTIVATE_EFFECT', effectId: 'ORCO_GUERRERO_BUFF', sourceInstanceId: source, targets: [orco] }).ok).toBe(true);
    passAll(state);

    const rivalSees = fieldView(state, 1, orco);
    expect(rivalSees).toMatchObject({ printedAtk: 3, atk: 6 });
    expect(rivalSees.statMods).toEqual(
      expect.arrayContaining([
        { source: 'Orco Guerrero', atk: 2, def: 0, kind: 'permanent' },
        { source: 'Armadura del poder', atk: 1, def: 0, kind: 'continuous' },
      ])
    );
    expect(state.log.some((l) => l.message === 'Orco Guerrero: +2 Atk.')).toBe(true);
  });
});

describe('Duel view: battles and log', () => {
  it('keeps the last battle step by step and shows player names instead of ids', async () => {
    const state = await makeDuel();
    state.players[0].name = 'Ana';
    const orco = await onField(state, 0, 'Orco Guerrero');
    const slime = await onField(state, 1, 'Slime', { position: 'defense' });
    toPhase(state, 'battle', 0);
    expect(applyAction(state, 0, { type: 'DECLARE_ATTACK', attackerInstanceId: orco, targetInstanceId: slime }).ok).toBe(true);
    passAll(state);

    const view = viewFor(state, 1);
    expect(view.lastBattle).toMatchObject({
      controllerIndex: 0,
      attacker: { name: 'Orco Guerrero', atk: 3 },
      defender: { name: 'Slime', position: 'defense', stat: 'def' },
    });
    expect(view.lastBattle.steps[0]).toMatch(/^Ana ataca con Orco Guerrero \(Atk 3\) a Slime \(en Defensa, Vida \d+\)\.$/);
    expect(view.lastBattle.steps).toContain('Nadie pierde VP.');
    expect(view.log.every((l) => !l.message.includes(state.players[0].userId))).toBe(true);
    const declared = view.log.find((l) => l.message.startsWith('Ana declara un ataque'));
    expect(declared).toMatchObject({ actor: 0 });
    expect(declared.message).toContain('Orco Guerrero ataca a Slime');
  });
});
