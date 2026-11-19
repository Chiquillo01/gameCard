// Nacimiento de la Magia (NdM): the cards programmed from the expansion's first 29, and the
// expansion chests (SBE, PAO, NdM) having every card of theirs to give.
const { connectDB, disconnectDB } = require('../../mongo/connection');
const { applyAction, viewFor } = require('../../game/engine');
const { recomputeContinuous, fireTrigger } = require('../../game/effectEngine');
const { placeMonster, placeSupport } = require('../../game/zones');
const { seedCatalog, makeDuel, instance, toHand, toDeckTop, toGraveyard, onField, toPhase, passAll, monster } = require('./engineHelpers');
const { placePending } = require('./chainHelpers');
const cards = require('../../data/seed/cards_final.json');
const effects = require('../../data/seed/effects_final.json');

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
    if (pending.kind === 'slot' || pending.kind === 'position') { placePending(state); sent = []; continue; }
    const p = pending.controllerIndex;
    const view = asked || viewFor(state, p).pendingTriggerChoice;
    const next = picks.find((id) => view.options.some((o) => o.instanceId === id) && !sent.includes(id)) || view.options[0].instanceId;
    sent = [...sent, next];
    const res = applyAction(state, p, { type: 'RESOLVE_TRIGGER_CHOICE', targets: sent });
    asked = res.reason === 'choose-target' ? res : null;
    if (res.reason !== 'choose-target') { sent = []; passAll(state); }
  }
};
const play = (state, p, instanceId, targets = []) => applyAction(state, p, { type: 'ACTIVATE_SUPPORT', instanceId, targets });
const effect = (state, p, effectId, source, targets = []) => applyAction(state, p, { type: 'ACTIVATE_EFFECT', effectId, sourceInstanceId: source, targets });
const fusionOnField = async (state, p, name) => {
  const id = await instance(p, name);
  placeMonster(state, id, p, { position: 'attack' });
  return id;
};
const summoned = (state, p, id, extra = {}) => {
  fireTrigger(state, 'onSummon', { instanceId: id, controllerIndex: p, cardId: monster(state, id).cardId, kind: 'special', ...extra });
};

describe('Expansion chests', () => {
  it('every SBE, PAO and NdM card can come out of its chest, and every NdM card has its effects', () => {
    const count = (ex) => cards.filter((c) => [].concat(c.expansion).includes(ex));
    expect(count('SBE').length).toBe(30);
    expect(count('PAO').length).toBe(30);
    expect(count('NdM').length).toBe(30);
    ['SBE', 'PAO', 'NdM'].forEach((ex) => expect(count(ex).filter((c) => c.obtainable === false).map((c) => c.name)).toEqual([]));
    const ids = new Set(effects.map((e) => e._id));
    const missing = count('NdM').filter((c) => !(c.effectCodes || []).length || c.effectCodes.some((id) => !ids.has(id)));
    expect(missing.map((c) => c.name)).toEqual([]);
  });

  it('the engine knows every action, cost and condition the new effects use', () => {
    const { registry: actions } = require('../../game/effects/actions');
    const { registry: costs } = require('../../game/effects/costs');
    const { registry: conditions } = require('../../game/effects/conditions');
    const ndm = new Set(cards.filter((c) => [].concat(c.expansion).includes('NdM')).flatMap((c) => c.effectCodes));
    effects.filter((e) => ndm.has(e._id)).forEach((e) => {
      (e.actions || []).forEach((a) => expect({ id: e._id, fn: a.fn, known: !!actions[a.fn] }).toEqual({ id: e._id, fn: a.fn, known: true }));
      if (e.cost) expect({ id: e._id, cost: e.cost.fn, known: !!costs[e.cost.fn] }).toEqual({ id: e._id, cost: e.cost.fn, known: true });
      (e.conditions || []).forEach((c) => expect({ id: e._id, cond: c.fn, known: !!conditions[c.fn] }).toEqual({ id: e._id, cond: c.fn, known: true }));
    });
  });
});

describe('Libros de hechizos', () => {
  it('Castigo destroys a monster, and draws 1 only while you control Anciana de los libros', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const kraken = await onField(state, 1, 'Kraken');
    const castigo = await toHand(state, 0, 'Libro de hechizos - Castigo');
    const hand = state.players[0].hand.length;
    expect(play(state, 0, castigo, [kraken]).ok).toBe(true);
    passAll(state);
    expect(monster(state, kraken)).toBeUndefined();
    expect(state.players[0].hand.length).toBe(hand - 1); // no Anciana: no draw

    await fusionOnField(state, 0, 'Anciana de los libros');
    const kraken2 = await onField(state, 1, 'Kraken');
    const castigo2 = await toHand(state, 0, 'Libro de hechizos - Castigo');
    const hand2 = state.players[0].hand.length;
    expect(play(state, 0, castigo2, [kraken2]).ok).toBe(true);
    passAll(state);
    expect(monster(state, kraken2)).toBeUndefined();
    expect(state.players[0].hand.length).toBe(hand2 - 1 + 1);
  });

  it('Fulminar destroys a support', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const target = await instance(1, 'Libro de hechizos - Volteo');
    placeSupport(state, target, 1, { faceDown: true });
    const fulminar = await toHand(state, 0, 'Libro de hechizos - Fulminar');
    expect(play(state, 0, fulminar, [target]).ok).toBe(true);
    passAll(state);
    expect(state.players[1].graveyard).toContain(target);
  });

  it('Dragar sends the picked one of the rival\'s top 3 to their Cementerio', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    await toDeckTop(state, 1, 'Slime');
    const second = await toDeckTop(state, 1, 'Bibliotecaria');
    await toDeckTop(state, 1, 'Slime');
    const dragar = await toHand(state, 0, 'Libro de hechizos - Dragar');
    expect(play(state, 0, dragar, [second]).ok).toBe(true);
    passAll(state);
    expect(state.players[1].graveyard).toContain(second);
    expect(state.players[1].deck).not.toContain(second);
  });

  it('Necronomicon brings back a "Biblio" monster from the Cementerio', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const biblio = await toGraveyard(state, 0, 'Bibliotecario');
    const necro = await toHand(state, 0, 'Libro de hechizos - Necronomicon');
    expect(play(state, 0, necro, [biblio]).ok).toBe(true);
    passAll(state);
    placePending(state);
    expect(monster(state, biblio)).toBeDefined();
  });
});

describe('Familiares Mágicos', () => {
  it('Gus equips itself to a Mago, which then can\'t be destroyed in battle; not to anything else', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const gus = await onField(state, 0, 'Familiar Mágico - Gus');
    expect(effect(state, 0, 'FAMILIAR_GUS_EQUIP', gus).ok).toBe(false); // no Mago yet
    const mago = await onField(state, 0, 'Bibliotecario');
    expect(effect(state, 0, 'FAMILIAR_GUS_EQUIP', gus, [mago]).ok).toBe(true);
    passAll(state);
    placePending(state);
    expect(monster(state, gus)).toBeUndefined();
    expect(state.players[0].field.support.find((s) => s && s.instanceId === gus)).toMatchObject({ equippedTo: mago, isMonsterEquip: true });
    recomputeContinuous(state);
    expect(monster(state, mago).cannotBeDestroyedByBattle).toBe(true);
  });

  it('Monin makes its Mago impossible to select with card effects; Mochi, impossible to exile', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const mago = await onField(state, 0, 'Bibliotecario');
    const monin = await onField(state, 0, 'Familiar Mágico - Monin');
    expect(effect(state, 0, 'FAMILIAR_MONIN_EQUIP', monin, [mago]).ok).toBe(true);
    passAll(state);
    placePending(state);
    recomputeContinuous(state);
    expect(monster(state, mago).untargetable).toBe(true);
    // The rival's Castigo can't pick it.
    toPhase(state, 'main1', 1);
    const castigo = await toHand(state, 1, 'Libro de hechizos - Castigo');
    const res = play(state, 1, castigo, [mago]);
    expect(res.reason).toBe('no-legal-target');

    const mago2 = await onField(state, 1, 'Bibliotecaria');
    const mochi = await onField(state, 1, 'Familiar Mágico - Mochi');
    expect(effect(state, 1, 'FAMILIAR_MOCHI_EQUIP', mochi, [mago2]).ok).toBe(true);
    passAll(state);
    placePending(state);
    recomputeContinuous(state);
    expect(monster(state, mago2).cannotBeExiledByEffects).toBe(true);
  });
});

describe('Bibliotecario, Bibliotecaria and Anciana de los libros', () => {
  it('Bibliotecario discards itself to summon Bibliotecaria from the Mazo, who then adds two Libros', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const l1 = await toDeckTop(state, 0, 'Libro de hechizos - Castigo');
    const l2 = await toDeckTop(state, 0, 'Libro de hechizos - Fulminar');
    const l3 = await toDeckTop(state, 0, 'Libro de hechizos - Dragar');
    const tecaria = await toDeckTop(state, 0, 'Bibliotecaria');
    const tecario = await toHand(state, 0, 'Bibliotecario');
    expect(effect(state, 0, 'BIBLIOTECARIO_DISCARD_SUMMON', tecario, [tecaria]).ok).toBe(true);
    passAll(state);
    answer(state, [l1, l2]);
    passAll(state);
    expect(monster(state, tecaria)).toBeDefined();
    expect(state.players[0].graveyard).toContain(tecario);
    const libros = [l1, l2, l3].filter((id) => state.players[0].hand.includes(id));
    expect(libros.length).toBe(2);
  });

  it('Bibliotecaria summoned some other way adds only one Libro', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const l1 = await toDeckTop(state, 0, 'Libro de hechizos - Castigo');
    const l2 = await toDeckTop(state, 0, 'Libro de hechizos - Fulminar');
    const tecaria = await onField(state, 0, 'Bibliotecaria');
    summoned(state, 0, tecaria);
    answer(state, [l1]);
    expect([l1, l2].filter((id) => state.players[0].hand.includes(id))).toEqual([l1]);
  });

  it('Bibliotecaria in the Cementerio: exile her and Bibliotecario, draw 1 per Libro used this turn', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const tecaria = await toGraveyard(state, 0, 'Bibliotecaria');
    const tecario = await toGraveyard(state, 0, 'Bibliotecario');
    expect(effect(state, 0, 'BIBLIOTECARIA_GY_DRAW', tecaria).ok).toBe(false); // no Libro used yet
    const k1 = await onField(state, 1, 'Kraken');
    const k2 = await onField(state, 1, 'Kraken');
    for (const k of [k1, k2]) {
      const libro = await toHand(state, 0, 'Libro de hechizos - Castigo');
      expect(play(state, 0, libro, [k]).ok).toBe(true);
      passAll(state);
    }
    const hand = state.players[0].hand.length;
    expect(effect(state, 0, 'BIBLIOTECARIA_GY_DRAW', tecaria).ok).toBe(true);
    passAll(state);
    expect(state.players[0].banished).toEqual(expect.arrayContaining([tecaria, tecario]));
    expect(state.players[0].hand.length).toBe(hand + 2);
  });

  it('Anciana: on summon a Libro from the Cementerio; discard a Libro to destroy the highest-Atk card; the rival only plays on their own turn', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const fromGY = await toGraveyard(state, 0, 'Libro de hechizos - Fulminar');
    const anciana = await fusionOnField(state, 0, 'Anciana de los libros');
    summoned(state, 0, anciana);
    answer(state, [fromGY]);
    expect(state.players[0].hand).toContain(fromGY);

    // A face-down Veloz of the rival can't be used on Anciana's controller's turn.
    const volteo = await instance(1, 'Libro de hechizos - Volteo');
    placeSupport(state, volteo, 1, { faceDown: true });
    state.players[1].field.support.find((s) => s && s.instanceId === volteo).setTurn = state.turnNumber - 1;
    recomputeContinuous(state);
    expect(applyAction(state, 1, { type: 'ACTIVATE_EFFECT', effectId: 'HECHIZO_VOLTEO_DEF_DOWN', sourceInstanceId: volteo, targets: [anciana] }).ok).toBe(false);

    // The card with the most Atk on the whole field goes (Hada: 12 > Anciana: 5 > Kraken: 1).
    const big = await onField(state, 1, 'Hada del Bosque Oscuro');
    const small = await onField(state, 1, 'Kraken');
    expect(effect(state, 0, 'ANCIANA_DISCARD_DESTROY', anciana, [fromGY]).ok).toBe(true);
    passAll(state);
    expect(state.players[0].graveyard).toContain(fromGY);
    expect(monster(state, big)).toBeUndefined();
    expect(monster(state, small)).toBeDefined();
    expect(monster(state, anciana)).toBeDefined();
    // Once per turn.
    const another = await toHand(state, 0, 'Libro de hechizos - Castigo');
    expect(effect(state, 0, 'ANCIANA_DISCARD_DESTROY', anciana, [another]).ok).toBe(false);
  });
});

describe('Biblioteca Ancestral', () => {
  it('on play adds Bibliotecaria/o; Libros cost 1 less and can be played from the hand on the rival\'s turn; recycles Libros once per turn', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const tecaria = await toDeckTop(state, 0, 'Bibliotecaria');
    const biblioteca = await toHand(state, 0, 'Biblioteca Ancestral');
    state.players[0].pixelcoins = 10;
    expect(play(state, 0, biblioteca, ['choice:0', tecaria]).ok).toBe(true);
    passAll(state);
    answer(state, [tecaria]);
    expect(state.players[0].hand).toContain(tecaria);
    expect(state.players[0].field.territory).toMatchObject({ instanceId: biblioteca });
    expect(state.players[0].pixelcoins).toBe(10 - 4);

    // The rival's turn: a Castigo from the hand, for 2 Píxel.
    toPhase(state, 'main1', 1);
    const kraken = await onField(state, 1, 'Kraken');
    const castigo = await toHand(state, 0, 'Libro de hechizos - Castigo');
    state.players[0].pixelcoins = 5;
    state.window = { priorityPlayer: 0, openedBy: 1, label: 'invoca un monstruo' }; // the rival just summoned it
    expect(play(state, 0, castigo, [kraken]).ok).toBe(true);
    passAll(state);
    expect(monster(state, kraken)).toBeUndefined();
    expect(state.players[0].pixelcoins).toBe(5 - 2);

    // Back on its turn: the Libros in the Cementerio go back to the Mazo.
    toPhase(state, 'main1', 0);
    expect(state.players[0].graveyard).toContain(castigo);
    expect(effect(state, 0, 'BIBLIOTECA_RECYCLE_LIBROS', biblioteca).ok).toBe(true);
    passAll(state);
    expect(state.players[0].graveyard).not.toContain(castigo);
    expect(state.players[0].deck).toContain(castigo);
    expect(effect(state, 0, 'BIBLIOTECA_RECYCLE_LIBROS', biblioteca).ok).toBe(false); // once per turn
  });

  it('without it a Libro costs its full 3 and can\'t be played from the hand on the rival\'s turn', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 1);
    const kraken = await onField(state, 1, 'Kraken');
    const castigo = await toHand(state, 0, 'Libro de hechizos - Castigo');
    state.window = { priorityPlayer: 0, openedBy: 1, label: 'invoca un monstruo' };
    expect(play(state, 0, castigo, [kraken]).ok).toBe(false);
    state.window = null;
    toPhase(state, 'main1', 0);
    state.players[0].pixelcoins = 3;
    expect(play(state, 0, castigo, [kraken]).ok).toBe(true);
    passAll(state);
    expect(state.players[0].pixelcoins).toBe(0);
  });
});

describe('Sunna cards', () => {
  it('the Equipo Sunna instants need an "Armadura Sunna" on the field', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const kraken = await onField(state, 1, 'Kraken');
    const espada = await toHand(state, 0, 'Equipo Sunna - Espada Solar');
    expect(play(state, 0, espada, [kraken]).reason).toBe('conditions-not-met');
    const astas = await toHand(state, 0, 'Equipo Sunna - Astas de Combate');
    await toGraveyard(state, 1, 'Slime');
    expect(play(state, 0, astas).reason).toBe('conditions-not-met');
  });

  it('Plan Maestro adds an "Equipo Sunna"; from the Cementerio it shuffles them back and bounces as many rival cards', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const espada = await toDeckTop(state, 0, 'Equipo Sunna - Espada Solar');
    const plan = await toHand(state, 0, 'Equipo Sunna - Plan Maestro');
    expect(play(state, 0, plan, [espada]).ok).toBe(true);
    passAll(state);
    expect(state.players[0].hand).toContain(espada);
    expect(state.players[0].graveyard).toContain(plan);

    const e1 = await toGraveyard(state, 0, 'Equipo Sunna - Resonador');
    const e2 = await toGraveyard(state, 0, 'Equipo Sunna - Astas de Combate');
    const k1 = await onField(state, 1, 'Kraken');
    const k2 = await onField(state, 1, 'Slime');
    const k3 = await onField(state, 1, 'Kraken');
    let res = effect(state, 0, 'PLAN_MAESTRO_GY_BOUNCE', plan, [e1, e2, 'done:0']);
    expect(res.reason).toBe('choose-target');
    res = effect(state, 0, 'PLAN_MAESTRO_GY_BOUNCE', plan, [e1, e2, 'done:0', k1, k2]);
    expect(res.ok).toBe(true);
    passAll(state);
    expect(state.players[0].banished).toContain(plan);
    expect(state.players[0].deck).toEqual(expect.arrayContaining([e1, e2]));
    expect(state.players[1].hand).toEqual(expect.arrayContaining([k1, k2]));
    expect(monster(state, k3)).toBeDefined();
  });

  it('Zona de Impacto adds Sunna on play; once per turn excavates 3, keeps an "Equipo Sunna" and mills the rest', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const sunne = await toDeckTop(state, 0, 'Sunna, Princesa Llama');
    const zona = await toHand(state, 0, 'Zona de Impacto');
    expect(play(state, 0, zona, [sunne]).ok).toBe(true);
    passAll(state);
    expect(state.players[0].hand).toContain(sunne);

    const a = await toDeckTop(state, 0, 'Slime');
    const equipo = await toDeckTop(state, 0, 'Equipo Sunna - Resonador');
    const b = await toDeckTop(state, 0, 'Kraken');
    expect(effect(state, 0, 'ZONA_IMPACTO_EXCAVATE', zona, [equipo]).ok).toBe(true);
    passAll(state);
    expect(state.players[0].hand).toContain(equipo);
    expect(state.players[0].graveyard).toEqual(expect.arrayContaining([a, b]));
    expect(effect(state, 0, 'ZONA_IMPACTO_EXCAVATE', zona).ok).toBe(false);
  });

  it('Sunna, Princesa Llama can\'t summon an Armadura while there is none in the Mazo-C', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const sunne = await onField(state, 0, 'Sunna, Princesa Llama');
    expect(effect(state, 0, 'SUNNE_PRINCESA_SUMMON_ARMADURA', sunne).ok).toBe(false);
  });

  it('Sunna summons an Armadura Sunna from the Mazo-C, which then lets the Equipo Sunna cards be played', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const sunne = await onField(state, 0, 'Sunna, Princesa Llama');
    const prometea = await instance(0, 'Armadura Sunna, Prometea');
    state.players[0].extra.push(prometea);
    expect(effect(state, 0, 'SUNNE_PRINCESA_SUMMON_ARMADURA', sunne, [prometea]).ok).toBe(true);
    passAll(state);
    answer(state);
    expect(monster(state, prometea)).toBeDefined();
    const kraken = await onField(state, 1, 'Kraken');
    const espada = await toHand(state, 0, 'Equipo Sunna - Espada Solar');
    expect(play(state, 0, espada, [kraken]).ok).toBe(true);
    passAll(state);
    expect(monster(state, kraken)).toBeUndefined();
  });

  it('Armadura Sunna, Prometea: compiled from Sunna; +1 Atk per "Equipo Sunna -" in the Cementerio; recovers one; burns once per turn; one a turn', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const sunne = await onField(state, 0, 'Sunna, Princesa Llama');
    const e1 = await toGraveyard(state, 0, 'Equipo Sunna - Resonador');
    await toGraveyard(state, 0, 'Equipo Sunna - Espada Solar');
    const prometea = await instance(0, 'Armadura Sunna, Prometea');
    state.players[0].extra.push(prometea);
    expect(applyAction(state, 0, { type: 'COMPILE_SUMMON', instanceId: prometea, materialInstanceIds: [sunne] }).ok).toBe(true);
    answer(state, [e1]);
    passAll(state);
    expect(monster(state, prometea)).toBeDefined();
    expect(state.players[0].hand).toContain(e1);
    recomputeContinuous(state);
    expect(require('../../game/effectEngine').getEffectiveStats(monster(state, prometea)).atk).toBe(10 + 1); // one Equipo left in the Cementerio
    const kraken = await onField(state, 1, 'Kraken');
    expect(effect(state, 0, 'PROMETEA_BURN', prometea, [kraken]).ok).toBe(true);
    passAll(state);
    expect(require('../../game/statuses').hasStatus(state, kraken, 'Quemadura')).toBe(true);
    expect(effect(state, 0, 'PROMETEA_BURN', prometea, [kraken]).ok).toBe(false);
    // A second Prometea the same turn can't be compiled (even with a valid material).
    const sunne2 = await onField(state, 0, 'Sunna, Princesa Llama');
    const prometea2 = await instance(0, 'Armadura Sunna, Prometea');
    state.players[0].extra.push(prometea2);
    expect(applyAction(state, 0, { type: 'COMPILE_SUMMON', instanceId: prometea2, materialInstanceIds: [sunne2] }).reason).toBe('summon-requirement');
  });

  it('Armadura Sunna, Líquida: compiled from an Armadura of another attribute, not of its own; freezes; adds an Equipo not named like those in the Cementerio at the end of the turn', async () => {
    const state = await makeDuel();
    toPhase(state, 'main1', 0);
    const otherLiquida = await fusionOnField(state, 0, 'Armadura Sunna, Líquida');
    const liquida = await instance(0, 'Armadura Sunna, Líquida');
    state.players[0].extra.push(liquida);
    expect(applyAction(state, 0, { type: 'COMPILE_SUMMON', instanceId: liquida, materialInstanceIds: [otherLiquida] }).ok).toBe(false);
    const prometea = await fusionOnField(state, 0, 'Armadura Sunna, Prometea');
    const kraken = await onField(state, 1, 'Kraken');
    expect(applyAction(state, 0, { type: 'COMPILE_SUMMON', instanceId: liquida, materialInstanceIds: [prometea] }).ok).toBe(true);
    answer(state, [kraken]);
    passAll(state);
    expect(monster(state, liquida)).toBeDefined();
    expect(require('../../game/statuses').hasStatus(state, kraken, 'Congelado')).toBe(true);

    await toGraveyard(state, 0, 'Equipo Sunna - Resonador');
    const sameName = await toDeckTop(state, 0, 'Equipo Sunna - Resonador');
    const other = await toDeckTop(state, 0, 'Equipo Sunna - Espada Solar');
    fireTrigger(state, 'phase', { timing: 'endPhase' });
    answer(state, [sameName, other]);
    expect(state.players[0].hand).toContain(other);
    expect(state.players[0].hand).not.toContain(sameName);
  });
});
