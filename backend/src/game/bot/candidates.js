// Every move worth trying for the bot right now. It's a generous list — whatever the rules don't
// allow (wrong phase, a cost it can't pay, no free zone) the engine refuses when it's simulated,
// so this never has to repeat the rules itself.
const { computeAvailableEffects, specialSummonAvailable } = require('../engine');
const { getCard } = require('../cardIndex');
const { cardIdFromInstance } = require('../deckUtils');
const { canBeNormalSummoned } = require('../summonRules');
const { matchesCardFilter } = require('../filters');
const { getEffectiveStats } = require('../effectEngine');

const cardOf = (id) => getCard(cardIdFromInstance(id));

function candidateActions(state, me) {
  const pl = state.players[me];
  const opp = state.players[1 - me];
  const inChain = state.chain.length > 0;
  const actions = [];

  const fieldIds = [...pl.field.monsters, ...pl.field.support, pl.field.territory].filter((e) => e && !e.isToken).map((e) => e.instanceId);
  [...pl.hand, ...fieldIds, ...pl.graveyard, ...pl.banished, ...pl.extra].forEach((id) => {
    computeAvailableEffects(state, me, id, cardIdFromInstance(id)).forEach((effectId) => {
      actions.push({ type: 'ACTIVATE_EFFECT', effectId, sourceInstanceId: id });
    });
  });

  pl.hand.forEach((id) => {
    const card = cardOf(id);
    if (card.category !== 'support') return;
    actions.push({ type: 'ACTIVATE_SUPPORT', instanceId: id });
    if (!inChain && card.subtype !== 'territory') actions.push({ type: 'ACTIVATE_SUPPORT', instanceId: id, setFaceDown: true });
  });
  pl.field.support.forEach((s) => { if (s && s.faceDown) actions.push({ type: 'ACTIVATE_SET_SUPPORT', instanceId: s.instanceId }); });

  if (inChain || state.turnPlayer !== me) return actions;

  if (state.phase === 'main1' || state.phase === 'main2') {
    if (!pl.normalSummonUsed) {
      pl.hand.forEach((id) => {
        const card = cardOf(id);
        if (card.category !== 'monster' || !canBeNormalSummoned(card)) return;
        actions.push({ type: 'NORMAL_SUMMON', instanceId: id, position: 'attack' });
        actions.push({ type: 'NORMAL_SUMMON', instanceId: id, position: 'defense' });
        actions.push({ type: 'NORMAL_SUMMON', instanceId: id, position: 'defense', faceDown: true });
      });
    }
    [...pl.hand, ...pl.graveyard, ...pl.banished].forEach((id) => {
      const card = cardOf(id);
      if (card.category === 'monster' && specialSummonAvailable(state, me, id, card)) actions.push({ type: 'SPECIAL_SUMMON', instanceId: id });
    });
    [...pl.extra, ...pl.hand].forEach((id) => {
      if (cardOf(id).category !== 'fusion') return;
      const materials = findMaterials(state, me, cardOf(id));
      if (materials) actions.push({ type: 'COMPILE_SUMMON', instanceId: id, materialInstanceIds: materials });
    });
    pl.field.monsters.forEach((m) => {
      if (!m) return;
      if (m.faceDown || m.position !== 'attack') actions.push({ type: 'CHANGE_POSITION', instanceId: m.instanceId, position: 'attack' });
      if (!m.faceDown && m.position !== 'defense') actions.push({ type: 'CHANGE_POSITION', instanceId: m.instanceId, position: 'defense' });
    });
  }

  if (state.phase === 'battle') {
    const targets = [null, ...opp.field.monsters.filter(Boolean).map((m) => m.instanceId)];
    pl.field.monsters.forEach((m) => {
      if (!m || m.faceDown || m.position !== 'attack') return;
      targets.forEach((t) => actions.push({ type: 'DECLARE_ATTACK', attackerInstanceId: m.instanceId, targetInstanceId: t }));
      if ((m.materials || []).length) actions.push({ type: 'DECOMPILE', instanceId: m.instanceId });
    });
  }
  return actions;
}

// One set of materials for a Compilación — the cheapest that fits each requirement of the recipe
// (zones as compileSummon allows them: the field unless the recipe says hand/Cementerio).
function findMaterials(state, me, card) {
  const reqs = (card.activationCost && card.activationCost.args && card.activationCost.args.materials) || [];
  if (!reqs.length) return null;
  const pl = state.players[me];
  const pool = [
    ...pl.field.monsters.filter(Boolean).map((m) => ({ id: m.instanceId, zone: 'field', cost: m.isToken ? 0 : 1 + getEffectiveStats(m).atk + getEffectiveStats(m).def })),
    ...[...pl.field.support, pl.field.territory].filter(Boolean).map((s) => ({ id: s.instanceId, zone: 'field', cost: 2 })),
    ...pl.hand.map((id) => ({ id, zone: 'hand', cost: 3 })),
    ...pl.graveyard.map((id) => ({ id, zone: 'graveyard', cost: 0 })),
  ].filter((c) => !c.id.startsWith('token:'));
  const used = new Set();
  for (const req of reqs) {
    const zones = req.zone ? (Array.isArray(req.zone) ? req.zone : [req.zone]) : ['field'];
    const fits = pool
      .filter((c) => !used.has(c.id) && zones.includes(c.zone) && matchesCardFilter(cardOf(c.id), req))
      .sort((a, b) => a.cost - b.cost)
      .slice(0, req.count || 1);
    if (fits.length < (req.count || 1)) return null;
    fits.forEach((c) => used.add(c.id));
  }
  return [...used];
}

module.exports = { candidateActions, findMaterials };
