const { getCard } = require('./cardIndex');
const { player, placeMonster, moveToZone, findInstanceLocation, log, opponentIndex } = require('./zones');
const { payCost } = require('./effects/costs');
const { fireTrigger, recomputeContinuous } = require('./effectEngine');
const { matchesCardFilter } = require('./filters');
const { cardIdFromInstance } = require('./deckUtils');

function normalSummon(state, controllerIndex, instanceId, { position = 'attack', faceDown = false } = {}) {
  const pl = player(state, controllerIndex);
  if (pl.normalSummonUsed) return { ok: false, reason: 'normal-summon-used' };
  if (!pl.hand.includes(instanceId)) return { ok: false, reason: 'not-in-hand' };

  const cardId = cardIdFromInstance(instanceId);
  const card = getCard(cardId);
  if (card.category !== 'monster') return { ok: false, reason: 'not-a-monster' };

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

  usedIds.forEach((id) => moveToZone(state, id, 'graveyard', controllerIndex));
  const placed = placeMonster(state, compiladoInstanceId, controllerIndex, { position: 'attack' });
  if (!placed) return { ok: false, reason: 'no-field-space' };

  log(state, `${pl.userId} compila a ${card.name}.`);
  fireTrigger(state, 'onSummon', { breed: card.breed });
  recomputeContinuous(state);
  return { ok: true };
}

module.exports = { normalSummon, compileSummon };
