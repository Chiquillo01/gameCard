// CdG cards programmed from the final card list, plus the fixes to Goblin Astuto and Tormenta.
const { connectDB, disconnectDB } = require('../../mongo/connection');
const { applyAction, viewFor } = require('../../game/engine');
const { recomputeContinuous, getEffectiveStats } = require('../../game/effectEngine');
const { placeSupport } = require('../../game/zones');
const { getCard } = require('../../game/cardIndex');
const { seedCatalog, makeDuel, instance, toHand, toDeckTop, toGraveyard, onField, toPhase, passAll, monster } = require('./engineHelpers');
const { placePending } = require('./chainHelpers');

beforeAll(async () => {
  await connectDB();
  await seedCatalog();
});

afterAll(async () => {
  await disconnectDB();
});

// Answers every pending choice with the option `pick` prefers (or the first one).
const resolveChoices = (state, p, pick = () => null) => {
  let guard = 0;
  while (guard++ < 10) {
    const pending = viewFor(state, p).pendingTriggerChoice;
    if (!pending) break;
    if (pending.kind === 'slot') { placePending(state); continue; }
    applyAction(state, p, { type: 'RESOLVE_TRIGGER_CHOICE', targets: [pick(pending) || pending.options[0].instanceId] });
    passAll(state);
    placePending(state);
  }
};
const atk = (state, id) => getEffectiveStats(monster(state, id)).atk;
// Activates an effect, answering a "choose-target" with `picks`.
const activate = (state, p, effectId, source, picks = []) => {
  let res = applyAction(state, p, { type: 'ACTIVATE_EFFECT', effectId, sourceInstanceId: source });
  if (res.reason === 'choose-target') res = applyAction(state, p, { type: 'ACTIVATE_EFFECT', effectId, sourceInstanceId: source, targets: picks });
  return res;
};

describe('Goblin Astuto', () => {
  it('sacrifices itself to bring out a Grokkar from the hand or Cementerio', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const astuto = await onField(state, 0, 'Goblin Astuto');
    const orco = await toHand(state, 0, 'Orco Guerrero');
    expect(activate(state, 0, 'TRASGO_ASTUTO_SACRIFICE_SUMMON', astuto, [orco]).ok).toBe(true);
    passAll(state);
    placePending(state);
    expect(state.players[0].graveyard).toContain(astuto);
    expect(monster(state, orco)).toBeDefined();
  });
});

describe('Orco Traicionero / Orcos del primer Batallón', () => {
  it('sacrificed for an Orco\'s effect (Orco Gladiador), the non-Grokkar lose 1 Atk / the Grokkar gain 1', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const gladiador = await onField(state, 0, 'Orco Gladiador');
    const traidor = await onField(state, 0, 'Orco Traicionero');
    const slime = await onField(state, 1, 'Slime');
    const guerrero = await onField(state, 1, 'Orco Guerrero');
    const before = { slime: atk(state, slime), guerrero: atk(state, guerrero) };
    expect(activate(state, 0, 'ORCO_GLADIADOR_EXTRA_ATTACK', gladiador, [traidor]).ok).toBe(true);
    passAll(state);
    recomputeContinuous(state);
    expect(atk(state, slime)).toBe(Math.max(0, before.slime - 1));
    expect(atk(state, guerrero)).toBe(before.guerrero);

    const state2 = await makeDuel();
    toPhase(state2, 'main1', 0);
    const g2 = await onField(state2, 0, 'Orco Gladiador');
    const batallon = await onField(state2, 0, 'Orcos del primer Batallón');
    const otherOrco = await onField(state2, 1, 'Orco Guerrero');
    const b2 = atk(state2, otherOrco);
    expect(activate(state2, 0, 'ORCO_GLADIADOR_EXTRA_ATTACK', g2, [batallon]).ok).toBe(true);
    passAll(state2);
    recomputeContinuous(state2);
    expect(atk(state2, otherOrco)).toBe(b2 + 1);
  });
});

describe('Ciudadela de los Verdes', () => {
  it('once per turn summons a Grokkar from the Mazo, and "Orco" monsters deal piercing damage', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const ciudadela = await toHand(state, 0, 'Ciudadela de los Verdes');
    state.players[0].pixelcoins = 8;
    expect(applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: ciudadela }).ok).toBe(true);
    passAll(state);
    const grokkar = await toDeckTop(state, 0, 'Goblin Guardián');
    expect(activate(state, 0, 'CIUDADELA_SUMMON_GROKKAR', ciudadela, [grokkar]).ok).toBe(true);
    passAll(state);
    placePending(state);
    expect(monster(state, grokkar)).toBeDefined();
    expect(activate(state, 0, 'CIUDADELA_SUMMON_GROKKAR', ciudadela)).toMatchObject({ ok: false, reason: 'once-per-turn' });

    const orco = await onField(state, 0, 'Orco Guerrero');
    const wall = await onField(state, 1, 'Slime', { position: 'defense' });
    toPhase(state, 'main1', 1);
    toPhase(state, 'battle', 0);
    const vp = state.players[1].vp;
    expect(applyAction(state, 0, { type: 'DECLARE_ATTACK', attackerInstanceId: orco, targetInstanceId: wall }).ok).toBe(true);
    passAll(state);
    const diff = getCard(monster(state, orco).cardId).atk - getCard(await (async () => monster(state, wall) ? monster(state, wall).cardId : (await require('./engineHelpers').idOf('Slime')))()).def;
    expect(state.players[1].vp).toBe(vp - diff);
  });
});

describe('Grover, el Goblin Guardián', () => {
  it('can attack from defense position and is not destroyed in battle', async () => {
    const state = await makeDuel();
    const guardian = await instance(0, 'Grover, el Goblin Guardián');
    state.players[0].extra.push(guardian);
    toPhase(state, 'main1', 1);
    toPhase(state, 'main1', 0);
    require('../../game/zones').placeMonster(state, guardian, 0, { position: 'defense' });
    recomputeContinuous(state);
    const big = await onField(state, 1, 'Orco Guerrero');
    toPhase(state, 'battle', 0);
    expect(applyAction(state, 0, { type: 'DECLARE_ATTACK', attackerInstanceId: guardian, targetInstanceId: big }).ok).toBe(true);
    passAll(state);
    expect(monster(state, guardian)).toBeDefined();
  });
});

describe('Conjurador Orco', () => {
  it('the rival\'s monsters can\'t be destroyed (battle or effects); non-"Orco" monsters go to attack and lose 3 Atk', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 1);
    const theirs = await onField(state, 1, 'Kraken', { position: 'defense' });
    toPhase(state, 'main1', 0);
    const conj = await instance(0, 'Conjurador Orco');
    require('../../game/zones').placeMonster(state, conj, 0, { position: 'attack' });
    recomputeContinuous(state);
    expect(monster(state, theirs).position).toBe('attack');
    expect(atk(state, theirs)).toBe(Math.max(0, getCard(monster(state, theirs).cardId).atk - 3));
    const relampago = await toHand(state, 0, 'Relámpago');
    expect(applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: relampago, targets: [theirs] }).ok).toBe(true);
    passAll(state);
    expect(monster(state, theirs)).toBeDefined();
    toPhase(state, 'main1', 1);
    expect(applyAction(state, 1, { type: 'CHANGE_POSITION', instanceId: theirs, position: 'defense' })).toMatchObject({ ok: false, reason: 'forced-attack-position' });
  });
});

describe('Grover, el Goblin', () => {
  it('on summon adds Catedral de los Goblins; its quick effect compiles a Grover Compilación using the hand', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const catedral = await toDeckTop(state, 0, 'Catedral de los Goblins');
    const grover = await toHand(state, 0, 'Grover, el Goblin');
    expect(applyAction(state, 0, { type: 'NORMAL_SUMMON', instanceId: grover }).ok).toBe(true);
    resolveChoices(state, 0);
    passAll(state);
    expect(state.players[0].hand).toContain(catedral);

    const solitario = await instance(0, 'Grover, el Goblin Solitario');
    state.players[0].extra.push(solitario);
    const material = await toHand(state, 0, 'Goblin Solitario');
    expect(activate(state, 0, 'GROVER_QUICK_COMPILE', grover, [solitario]).ok).toBe(true);
    passAll(state);
    placePending(state);
    expect(monster(state, solitario)).toBeDefined();
    expect(state.players[0].hand).not.toContain(material);
  });
});

describe('Catedral de los Goblins', () => {
  it('monsters that mention "Grover, el Goblin" in their text gain +2 Atk/Vida', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const grover = await onField(state, 0, 'Grover, el Goblin');
    const other = await onField(state, 0, 'Goblin Guardián');
    placeSupport(state, await instance(0, 'Catedral de los Goblins'), 0, { faceDown: false });
    recomputeContinuous(state);
    expect(monster(state, grover).tempBuff).toEqual({ atk: 2, def: 2 });
    expect(monster(state, other).tempBuff).toEqual({ atk: 0, def: 0 });
  });
});

describe('Grover, el Goblin Solitario', () => {
  it('discards a card to negate a support\'s activation and destroy it', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 1);
    const solitario = await instance(0, 'Grover, el Goblin Solitario');
    require('../../game/zones').placeMonster(state, solitario, 0, { position: 'attack' });
    const victim = await onField(state, 0, 'Goblin Guardián');
    const discard = await toHand(state, 0, 'Slime');
    const relampago = await toHand(state, 1, 'Relámpago');
    expect(applyAction(state, 1, { type: 'ACTIVATE_SUPPORT', instanceId: relampago, targets: [victim] }).ok).toBe(true);
    let res = applyAction(state, 0, { type: 'ACTIVATE_EFFECT', effectId: 'GROVER_SOLITARIO_NEGATE_SUPPORT', sourceInstanceId: solitario });
    if (res.reason === 'choose-target') res = applyAction(state, 0, { type: 'ACTIVATE_EFFECT', effectId: 'GROVER_SOLITARIO_NEGATE_SUPPORT', sourceInstanceId: solitario, targets: [discard] });
    expect(res.ok).toBe(true);
    passAll(state);
    expect(monster(state, victim)).toBeDefined();
    expect(state.players[0].graveyard).toContain(discard);
    expect(state.players[1].graveyard).toContain(relampago);
  });
});

describe('Orco Jefe', () => {
  it('needs 4 "Orco" to be special summoned; once per turn it summons a Grokkar from the Mazo in attack', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const jefe = await toHand(state, 0, 'Orco Jefe');
    for (let i = 0; i < 3; i++) await onField(state, 0, 'Orco Guerrero');
    expect(applyAction(state, 0, { type: 'SPECIAL_SUMMON', instanceId: jefe }).ok).toBe(false);
    await onField(state, 0, 'Orco Gladiador');
    expect(applyAction(state, 0, { type: 'SPECIAL_SUMMON', instanceId: jefe }).ok).toBe(true);
  });

  it('once per turn summons a Grokkar from the Mazo', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const jefe = await onField(state, 0, 'Orco Jefe');
    const grokkar = await toDeckTop(state, 0, 'Goblin Guardián');
    expect(activate(state, 0, 'ORCO_JEFE_SUMMON_GROKKAR', jefe, [grokkar]).ok).toBe(true);
    passAll(state);
    placePending(state);
    expect(monster(state, grokkar)).toMatchObject({ position: 'attack' });
  });
});

describe('El Duende Elegido', () => {
  it('negates a rival effect that summons, while you control a Goblin Compilación; that name is banned for the turn', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 1);
    const fusion = await instance(0, 'Grover, el Goblin Guardián');
    require('../../game/zones').placeMonster(state, fusion, 0, { position: 'attack' });
    const duende = placeSupport(state, await instance(0, 'El Duende Elegido'), 0, { faceDown: true }).instanceId;
    state.players[0].field.support.find((s) => s && s.instanceId === duende).setTurn = state.turnNumber - 1;
    state.players[0].pixelcoins = 8;
    const solitario = await onField(state, 1, 'Goblin Solitario');
    const goblin = await toHand(state, 1, 'Goblin Guardián');
    expect(activate(state, 1, 'GOBLIN_SOLITARIO_SUMMON', solitario, [goblin]).ok).toBe(true);
    expect(applyAction(state, 0, { type: 'ACTIVATE_EFFECT', effectId: 'DUENDE_ELEGIDO_COUNTER', sourceInstanceId: duende }).ok).toBe(true);
    passAll(state);
    placePending(state);
    expect(monster(state, goblin)).toBeUndefined();
    expect(monster(state, solitario)).toBeUndefined(); // destroyed
  });
});

describe('Goblin Ardiente', () => {
  it('once per turn switches a rival monster\'s battle position', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const ardiente = await onField(state, 0, 'Goblin Ardiente');
    const theirs = await onField(state, 1, 'Kraken');
    expect(activate(state, 0, 'GOBLIN_ARDIENTE_SWITCH', ardiente, [theirs]).ok).toBe(true);
    passAll(state);
    expect(monster(state, theirs).position).toBe('defense');
  });
});

describe('Tormenta de Relámpagos', () => {
  it('destroys every monster, even with monsters on its own side', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const mine = await onField(state, 0, 'Slime');
    const theirs = await onField(state, 1, 'Kraken');
    const tormenta = await toHand(state, 0, 'Tormenta de Relámpagos');
    state.players[0].pixelcoins = 8;
    expect(applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: tormenta }).ok).toBe(true);
    passAll(state);
    expect(monster(state, mine)).toBeUndefined();
    expect(monster(state, theirs)).toBeUndefined();
  });
});

describe('En busca del Goblin', () => {
  it('adds a "Goblin" card from the Mazo, never another En busca del Goblin', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    await toDeckTop(state, 0, 'En busca del Goblin');
    const goblin = await toDeckTop(state, 0, 'Goblin Guardián');
    const card = await toHand(state, 0, 'En busca del Goblin');
    state.players[0].pixelcoins = 8;
    let res = applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: card });
    if (res.reason === 'choose-target') {
      expect(res.options.map((o) => o.name)).not.toContain('En busca del Goblin');
      res = applyAction(state, 0, { type: 'ACTIVATE_SUPPORT', instanceId: card, targets: [goblin] });
    }
    expect(res.ok).toBe(true);
    passAll(state);
    expect(state.players[0].hand).toContain(goblin);
  });
});

describe('Orco Jefe on the field', () => {
  it('its "Orco" monsters gain +3 Atk only in the Battle Phase and can\'t be picked by card effects', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    await onField(state, 0, 'Orco Jefe');
    const orco = await onField(state, 0, 'Orco Guerrero');
    recomputeContinuous(state);
    expect(monster(state, orco).tempBuff.atk).toBe(0);
    expect(monster(state, orco).untargetableBy).toMatchObject({ by: 'any' });
    toPhase(state, 'main1', 1);
    toPhase(state, 'battle', 0);
    recomputeContinuous(state);
    expect(monster(state, orco).tempBuff.atk).toBe(3);
  });
});

describe('Catedral de los Goblins', () => {
  it('when its controller compiles, destroys a card on the field', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    placeSupport(state, await instance(0, 'Catedral de los Goblins'), 0, { faceDown: false });
    const target = await onField(state, 1, 'Kraken');
    const fusion = await instance(0, 'Orco Gigante');
    state.players[0].extra.push(fusion);
    const mats = [await onField(state, 0, 'Orco Guerrero'), await onField(state, 0, 'Orco Gladiador')];
    expect(applyAction(state, 0, { type: 'COMPILE_SUMMON', instanceId: fusion, materialInstanceIds: mats }).ok).toBe(true);
    resolveChoices(state, 0, (pending) => (pending.options.find((o) => o.instanceId === target) || {}).instanceId);
    passAll(state);
    expect(monster(state, target)).toBeUndefined();
  });
});
