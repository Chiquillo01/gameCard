const { getCard } = require('./cardIndex');
const { player, placeMonster, moveToZone, removeFromZone, releaseMaterials, corrodedSlots, findInstanceLocation, log } = require('./zones');
const { payCost } = require('./effects/costs');
const { fireTrigger, fireMaterialTriggers, recomputeContinuous } = require('./effectEngine');
const { getEffect } = require('./cardIndex');
const { clearStatus, BURN } = require('./statuses');
const { matchesCardFilter } = require('./filters');
const { cardIdFromInstance } = require('./deckUtils');
const { cannotBeSummoned, canBeNormalSummoned } = require('./summonRules');

function normalSummon(state, controllerIndex, instanceId, { position = 'attack', faceDown = false } = {}) {
  const pl = player(state, controllerIndex);
  if (pl.normalSummonUsed) return { ok: false, reason: 'normal-summon-used' };
  if (!pl.hand.includes(instanceId)) return { ok: false, reason: 'not-in-hand' };
  if (position !== 'attack' && position !== 'defense') return { ok: false, reason: 'invalid-position' };
  // A face-down monster is always "set" in defense — face-up attack, face-up defense, and
  // face-down defense are the only three legal states; a face-down attack position isn't one.
  if (faceDown && position !== 'defense') return { ok: false, reason: 'invalid-position' };

  const cardId = cardIdFromInstance(instanceId);
  const card = getCard(cardId);
  if (card.category !== 'monster') return { ok: false, reason: 'not-a-monster' };
  if (cannotBeSummoned(card)) return { ok: false, reason: 'cannot-be-summoned' };
  if (!canBeNormalSummoned(card)) return { ok: false, reason: 'special-summon-only' };

  const cost = card.summonCost;
  const ctx = { state, controllerIndex, sourceInstanceId: instanceId };
  if (cost && cost.fn) {
    const paid = payCost(ctx, cost, []);
    if (!paid) return { ok: false, reason: 'cannot-pay-summon-cost' };
  }

  const placed = placeMonster(state, instanceId, controllerIndex, { position, faceDown });
  if (!placed) return { ok: false, reason: 'no-field-space' };

  pl.normalSummonUsed = true;
  log(state, `${pl.userId} invoca a ${card.name}.`);
  fireTrigger(state, 'onSummon', { breed: card.breed });
  recomputeContinuous(state);
  return { ok: true };
}

// True when `loc` is a zone the controller actually owns and that satisfies `req.zone` (a
// string or array of "hand" | "field" | "graveyard"; materials with no `zone` default to
// "hand", matching a classic fusion that discards component monsters from your hand).
function materialLocationSatisfies(loc, controllerIndex, req) {
  if (!loc || loc.ownerIndex !== controllerIndex) return false;
  const allowed = req.zone ? (Array.isArray(req.zone) ? req.zone : [req.zone]) : ['hand'];
  return allowed.some((z) => {
    if (z === 'hand') return loc.zone === 'hand';
    if (z === 'graveyard') return loc.zone === 'graveyard';
    if (z === 'field') return loc.zone === 'field:monster' || loc.zone === 'field:support' || loc.zone === 'field:territory';
    return false;
  });
}

// Fusion/compilado summon. `materialInstanceIds` must satisfy every requirement in
// card.activationCost.args.materials (see backend game docs / compilate_costs.json).
function compileSummon(state, controllerIndex, compiladoInstanceId, materialInstanceIds) {
  const pl = player(state, controllerIndex);
  const zonesWithCompilado = [...pl.hand, ...pl.extra];
  if (!zonesWithCompilado.includes(compiladoInstanceId)) return { ok: false, reason: 'not-available' };

  const cardId = cardIdFromInstance(compiladoInstanceId);
  const card = getCard(cardId);
  const materials = (card.activationCost && card.activationCost.args && card.activationCost.args.materials) || [];

  const pool = new Set(materialInstanceIds);
  const usedIds = new Set();
  for (const req of materials) {
    let matched = 0;
    for (const id of pool) {
      if (usedIds.has(id)) continue;
      // Every candidate must be owned by the summoning player and sitting in a zone this
      // requirement actually allows — otherwise a crafted request could "borrow" a card the
      // opponent owns (or one that's already on the field/graveyard for a hand-only recipe)
      // and have it moved into the summoner's own graveyard.
      const loc = findInstanceLocation(state, id);
      if (!materialLocationSatisfies(loc, controllerIndex, req)) continue;
      const mCard = getCard(cardIdFromInstance(id));
      if (matchesCardFilter(mCard, req)) { usedIds.add(id); matched++; }
      if (matched >= req.count) break;
    }
    if (matched < req.count) return { ok: false, reason: `missing-material:${JSON.stringify(req)}` };
  }

  // Check there will be a free zone before touching anything: materials on the field free theirs.
  const blocked = corrodedSlots(pl, 'monsters');
  const hasRoom = pl.field.monsters.some((m, i) => !blocked.includes(i) && (m === null || usedIds.has(m.instanceId)));
  if (!hasRoom) return { ok: false, reason: 'no-field-space' };

  // Rulebook: the materials are stacked under the compiled monster (not sent to the graveyard) and
  // follow it wherever it goes; they can be summoned back by decompiling it.
  const used = [...usedIds];
  used.forEach((id) => {
    const loc = findInstanceLocation(state, id);
    if (loc.zone === 'field:monster') {
      // A compiled monster used as material sends the materials under it to the graveyard.
      releaseMaterials(state, pl.field.monsters[loc.slot], controllerIndex, 'graveyard');
      clearStatus(state, id, BURN);
    }
    removeFromZone(state, id, loc);
  });
  placeMonster(state, compiladoInstanceId, controllerIndex, { position: 'attack' });
  const entry = pl.field.monsters.find((m) => m && m.instanceId === compiladoInstanceId);
  entry.materials = used;

  log(state, `${pl.userId} compila a ${card.name}.`);
  fireMaterialTriggers(state, controllerIndex, used, compiladoInstanceId);
  fireTrigger(state, 'onSummon', { breed: card.breed });
  recomputeContinuous(state);
  return { ok: true };
}

// A card can lift the same-turn restriction for itself with a "rule" effect whose action is
// allowDecompileSameTurn (Pez dorado).
function allowsSameTurnDecompile(card) {
  return (card.effectCodes || []).some((id) => {
    const effect = getEffect(id);
    return effect && (effect.actions || []).some((a) => a.fn === 'allowDecompileSameTurn');
  });
}

// Rulebook: a compiled monster can be decompiled at the end of its controller's Battle Phase, but
// not the turn it was compiled. It goes back to the Mazo-C and its materials are summoned back.
// `force` is for card effects (Descompilación), which ignore the phase and same-turn limits.
function decompile(state, controllerIndex, instanceId, { force = false } = {}) {
  const pl = player(state, controllerIndex);
  const entry = pl.field.monsters.find((m) => m && m.instanceId === instanceId);
  if (!entry) return { ok: false, reason: 'not-found' };
  if (!entry.materials || !entry.materials.length) return { ok: false, reason: 'not-compiled' };
  const card = getCard(entry.cardId);
  if (!force) {
    if (state.phase !== 'battle') return { ok: false, reason: 'not-battle-phase' };
    if (entry.summonedTurn === state.turnNumber && !allowsSameTurnDecompile(card)) return { ok: false, reason: 'compiled-this-turn' };
  }

  // The compiled monster's own zone is freed, so the materials need (count - 1) more free zones.
  const blocked = corrodedSlots(pl, 'monsters');
  const free = pl.field.monsters.filter((m, i) => !blocked.includes(i) && (m === null || m.instanceId === instanceId)).length;
  if (free < entry.materials.length) return { ok: false, reason: 'no-field-space' };

  const materials = entry.materials;
  entry.materials = []; // keep them out of the release-to-Mazo path in moveToZone
  moveToZone(state, instanceId, 'extra', controllerIndex);
  materials.forEach((id) => {
    placeMonster(state, id, controllerIndex, { position: 'attack' });
    const back = pl.field.monsters.find((m) => m && m.instanceId === id);
    if (back) back.hasAttacked = true; // decompiling happens as the Battle Phase ends
  });
  log(state, `${pl.userId} descompila a ${card.name}.`);
  materials.forEach((id) => fireTrigger(state, 'onSummon', { breed: getCard(cardIdFromInstance(id)).breed }));
  recomputeContinuous(state);
  return { ok: true };
}

module.exports = { normalSummon, compileSummon, decompile };
