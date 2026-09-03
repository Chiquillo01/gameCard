const { getCard } = require('./cardIndex');
const { player, placeMonster, moveToZone, log, opponentIndex } = require('./zones');
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
