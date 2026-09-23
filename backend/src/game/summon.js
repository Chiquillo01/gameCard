const { getCard } = require('./cardIndex');
const { player, placeMonster, moveToZone, removeFromZone, releaseMaterials, corrodedSlots, findInstanceLocation, log } = require('./zones');
const { payCost, pendingCostChoice } = require('./effects/costs');
const { fireTrigger, fireMaterialTriggers, recomputeContinuous, resolveActions } = require('./effectEngine');
const { checkConditions } = require('./effects/conditions');
const { getEffect } = require('./cardIndex');
const { clearStatus, BURN } = require('./statuses');
const { matchesCardFilter } = require('./filters');
const { cardIdFromInstance } = require('./deckUtils');
const { cannotBeSummoned, canBeNormalSummoned } = require('./summonRules');

function normalSummon(state, controllerIndex, instanceId, { position = 'attack', faceDown = false, slot = null } = {}) {
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

  // Rulebook: the player chooses where on the board the monster lands, not the engine.
  const placed = placeMonster(state, instanceId, controllerIndex, { position, faceDown, slot });
  if (!placed) return { ok: false, reason: 'no-field-space' };

  pl.normalSummonUsed = true;
  log(state, `${pl.userId} invoca a ${card.name}.`);
  announceSummon(state, controllerIndex, instanceId, card, faceDown);
  recomputeContinuous(state);
  return { ok: true };
}

// Rulebook, "Método de invocación": a monster whose invocation method describes a special-summon
// condition/cost (own effectCodes carry a `summon_rule` effect) — doesn't touch normalSummonUsed,
// since a special summon is an ADDITIONAL way to bring it out, not a replacement for the turn's
// Normal Summon.
function specialSummon(state, controllerIndex, instanceId, targets = [], slot = null) {
  const pl = player(state, controllerIndex);
  const loc = findInstanceLocation(state, instanceId);
  if (!loc || loc.ownerIndex !== controllerIndex) return { ok: false, reason: 'not-in-hand' };

  const cardId = cardIdFromInstance(instanceId);
  const card = getCard(cardId);
  if (card.category !== 'monster') return { ok: false, reason: 'not-a-monster' };
  if (cannotBeSummoned(card)) return { ok: false, reason: 'cannot-be-summoned' };

  // A rule with its own `trigger` (Avispa Mutante) fires automatically instead — see
  // fireHandTrigger below — not something the player invokes with this action.
  const rule = (card.effectCodes || []).map(getEffect).find((e) => e && e.type === 'summon_rule' && !e.trigger && (e.actions || []).some((a) => a.fn === 'specialSummon'));
  if (!rule) return { ok: false, reason: 'no-special-summon-method' };

  // Most special summons are from hand; a few (Aboleth, Perro Esqueleto) name other zones via
  // their own canBeSummonedFrom condition.
  const zoneRule = (rule.conditions || []).find((c) => c.fn === 'canBeSummonedFrom');
  const allowedZones = zoneRule ? zoneRule.args.zones : ['hand'];
  if (!allowedZones.includes(loc.zone)) return { ok: false, reason: 'not-in-hand' };

  // `slot` rides along on ctx for the rule's own `specialSummon` action (actions.js) to place it
  // where the player picked, rather than the engine's own first-empty fallback.
  const ctx = { state, controllerIndex, sourceInstanceId: instanceId, effect: rule, slot };
  if (!checkConditions(ctx, rule.conditions)) return { ok: false, reason: 'special-summon-condition-not-met' };

  // Checked but not marked yet — a still-pending cost choice or a failed payment shouldn't burn
  // the turn's shot at this, only an actual summon should.
  const turnLimitKey = rule.oncePerTurn && `${state.turnNumber}:${rule._id}:${instanceId}`;
  if (turnLimitKey && state.turnLimits && state.turnLimits[turnLimitKey]) return { ok: false, reason: 'once-per-turn' };

  if (rule.cost) {
    // Rulebook: a cost never picks for the player (see costs.js pendingCostChoice) — with more
    // legal payers than it needs and nothing chosen yet, ask instead of silently taking one.
    const costChoice = pendingCostChoice(ctx, rule.cost, targets);
    if (costChoice) return { ok: false, reason: 'choose-target', options: costChoice };
    const paid = payCost(ctx, rule.cost, targets);
    if (!paid) return { ok: false, reason: 'cannot-pay-special-summon-cost' };
  }
  if (turnLimitKey) {
    state.turnLimits = state.turnLimits || {};
    state.turnLimits[turnLimitKey] = true;
  }

  // The rule's own actions place it (the `specialSummon` action puts the source on the field,
  // attack position) — reusing the same dispatch every other effect resolves through.
  resolveActions(ctx, rule, []);
  if (!findInstanceLocation(state, instanceId) || findInstanceLocation(state, instanceId).zone !== 'field:monster') {
    return { ok: false, reason: 'no-field-space' };
  }

  log(state, `${pl.userId} invoca especial a ${card.name}.`);
  announceSummon(state, controllerIndex, instanceId, card, false);
  recomputeContinuous(state);
  return { ok: true };
}

// Tells the board a monster was summoned: its own 'onSummon' effects fire, then the controller's
// other cards get 'allySummoned' (a face-down Set isn't a summon).
function announceSummon(state, controllerIndex, instanceId, card, faceDown = false) {
  const event = { breed: card.breed, instanceId, controllerIndex, cardId: cardIdFromInstance(instanceId), faceDown };
  if (!faceDown) fireTrigger(state, 'onSummon', event);
  fireTrigger(state, 'allySummoned', event);
}

// A card's own summon_rule can trigger off something OTHER than the player choosing to special
// summon it — Avispa Mutante: "Si es añadida a tu Mano desde el Mazo o Cementerio, invocarlo
// inmediatamente de forma especial." Called wherever a card can land in hand that way (a search,
// or a card-effect draw — never the turn's own draw, which is what `exceptPhase: 'draw'` on the
// rule is for).
function fireHandTrigger(state, eventName, instanceId, controllerIndex) {
  const card = getCard(cardIdFromInstance(instanceId));
  if (card.category !== 'monster') return;
  const rule = (card.effectCodes || []).find((id) => {
    const e = getEffect(id);
    return e && e.type === 'summon_rule' && e.trigger && e.trigger.fn === eventName;
  });
  if (!rule) return;
  const effect = getEffect(rule);
  if (effect.trigger.args && effect.trigger.args.exceptPhase === state.phase) return;
  if (effect.oncePerTurn) {
    state.turnLimits = state.turnLimits || {};
    const key = `${state.turnNumber}:${effect._id}:${instanceId}`;
    if (state.turnLimits[key]) return;
    state.turnLimits[key] = true;
  }
  const ctx = { state, controllerIndex, sourceInstanceId: instanceId, effect };
  if (!checkConditions(ctx, effect.conditions)) return;
  if (effect.cost) {
    const paid = payCost(ctx, effect.cost, []);
    if (!paid) return;
  }
  resolveActions(ctx, effect, []);
  if (!findInstanceLocation(state, instanceId) || findInstanceLocation(state, instanceId).zone !== 'field:monster') return;
  log(state, `${player(state, controllerIndex).userId} invoca especial a ${card.name}.`);
  announceSummon(state, controllerIndex, instanceId, card, false);
  recomputeContinuous(state);
}

// True when `loc` is a zone the controller actually owns and that satisfies `req.zone` (a
// string or array of "hand" | "field" | "graveyard"; materials with no `zone` default to
// "field" only — Compilación is meant to be harder to pull off than just discarding cards from
// hand — unless the card's own recipe names a different zone, e.g. Héroe Fénix's "en Campo" or
// Gigante Elemental's "de tu Campo o Cementerio").
function materialLocationSatisfies(loc, controllerIndex, req) {
  if (!loc || loc.ownerIndex !== controllerIndex) return false;
  const allowed = req.zone ? (Array.isArray(req.zone) ? req.zone : [req.zone]) : ['field'];
  return allowed.some((z) => {
    if (z === 'hand') return loc.zone === 'hand';
    if (z === 'graveyard') return loc.zone === 'graveyard';
    if (z === 'field') return loc.zone === 'field:monster' || loc.zone === 'field:support' || loc.zone === 'field:territory';
    return false;
  });
}

// Fusion/compilado summon. `materialInstanceIds` must satisfy every requirement in
// card.activationCost.args.materials (see backend game docs / compilate_costs.json).
function compileSummon(state, controllerIndex, compiladoInstanceId, materialInstanceIds, slot = null) {
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
  // Rulebook: the player chooses where the compiled monster lands, same as any other summon.
  const blocked = corrodedSlots(pl, 'monsters');
  const isFreeOnceMaterialsLeave = (i) => !blocked.includes(i) && (pl.field.monsters[i] === null || usedIds.has(pl.field.monsters[i].instanceId));
  if (slot !== null) {
    if (slot < 0 || slot >= pl.field.monsters.length || !isFreeOnceMaterialsLeave(slot)) return { ok: false, reason: 'no-field-space' };
  } else if (!pl.field.monsters.some((m, i) => isFreeOnceMaterialsLeave(i))) {
    return { ok: false, reason: 'no-field-space' };
  }

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
  placeMonster(state, compiladoInstanceId, controllerIndex, { position: 'attack', slot });
  const entry = pl.field.monsters.find((m) => m && m.instanceId === compiladoInstanceId);
  entry.materials = used;

  log(state, `${pl.userId} compila a ${card.name}.`);
  fireMaterialTriggers(state, controllerIndex, used, compiladoInstanceId);
  announceSummon(state, controllerIndex, compiladoInstanceId, card);
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
  materials.forEach((id) => announceSummon(state, controllerIndex, id, getCard(cardIdFromInstance(id))));
  recomputeContinuous(state);
  return { ok: true };
}

module.exports = { normalSummon, specialSummon, compileSummon, decompile, fireHandTrigger };
