const { getCard } = require('./cardIndex');
const { player, opponentIndex, log } = require('./zones');
const { getEffectiveStats, fireTrigger, recomputeContinuous } = require('./effectEngine');
const { checkWin } = require('./effects/actions');

function hasKeyword(monsterEntry, keywordEffectId) {
  if (monsterEntry.isToken) return false;
  const card = getCard(monsterEntry.cardId);
  return (card.effectCodes || []).includes(keywordEffectId);
}

function declareAttack(state, controllerIndex, attackerInstanceId, targetInstanceId /* null = direct */) {
  if (state.phase !== 'battle') return { ok: false, reason: 'not-battle-phase' };
  if (state.turnPlayer !== controllerIndex) return { ok: false, reason: 'not-your-turn' };

  const attackerPl = player(state, controllerIndex);
  const attacker = attackerPl.field.monsters.find((m) => m && m.instanceId === attackerInstanceId);
  if (!attacker) return { ok: false, reason: 'attacker-not-found' };
  if (attacker.hasAttacked) return { ok: false, reason: 'already-attacked' };
  if (attacker.position !== 'attack') return { ok: false, reason: 'not-in-attack-position' };
  if (attacker.summonedTurn === state.turnNumber && !state.firstTurnSummonCanAttack) return { ok: false, reason: 'summoning-sickness' };

  const oppIdx = opponentIndex(controllerIndex);
  const oppPl = player(state, oppIdx);
  const attackerStats = getEffectiveStats(attacker);

  if (!targetInstanceId) {
    const oppHasMonsters = oppPl.field.monsters.some(Boolean);
    if (oppHasMonsters) return { ok: false, reason: 'must-target-a-monster' };
    oppPl.vp = Math.max(0, oppPl.vp - attackerStats.atk);
    log(state, `${attackerPl.userId} ataca directamente: ${attackerStats.atk} de daño (VP: ${oppPl.vp}).`);
    attacker.hasAttacked = true;
    fireTrigger(state, 'opponentDirectAttackDeclared', {});
    checkWin(state);
    return { ok: true, direct: true };
  }

  const defender = oppPl.field.monsters.find((m) => m && m.instanceId === targetInstanceId);
  if (!defender) return { ok: false, reason: 'defender-not-found' };
  const defenderStats = getEffectiveStats(defender);
  attacker.hasAttacked = true;

  let destroyedAttacker = false;
  let destroyedDefender = false;

  if (defender.position === 'attack') {
    if (attackerStats.atk > defenderStats.atk || hasKeyword(attacker, 'TOQUE_DE_MUERTE')) destroyedDefender = true;
    if (defenderStats.atk > attackerStats.atk) destroyedAttacker = true;
    if (attackerStats.atk === defenderStats.atk && attackerStats.atk > 0) { destroyedAttacker = true; destroyedDefender = true; }
    if (destroyedDefender && !destroyedAttacker) oppPl.vp = Math.max(0, oppPl.vp - (attackerStats.atk - defenderStats.atk));
    if (destroyedAttacker && !destroyedDefender) attackerPl.vp = Math.max(0, attackerPl.vp - (defenderStats.atk - attackerStats.atk));
  } else {
    // defending in defense position: only destroyed if atk > def, no VP loss to defender's owner
    if (attackerStats.atk > defenderStats.def || hasKeyword(attacker, 'TOQUE_DE_MUERTE')) destroyedDefender = true;
  }

  if (destroyedDefender) removeAndGraveyard(state, oppIdx, defender.instanceId);
  if (destroyedAttacker) removeAndGraveyard(state, controllerIndex, attacker.instanceId);

  log(state, `${attackerPl.userId} ataca con ${getCard(attacker.cardId || '').name || 'token'}.`);
  fireTrigger(state, 'onBattlePhase', {});
  recomputeContinuous(state);
  checkWin(state);
  return { ok: true, destroyedAttacker, destroyedDefender };
}

function removeAndGraveyard(state, ownerIndex, instanceId) {
  const pl = player(state, ownerIndex);
  const idx = pl.field.monsters.findIndex((m) => m && m.instanceId === instanceId);
  if (idx === -1) return;
  const [entry] = pl.field.monsters.splice(idx, 1, null);
  if (!entry.isToken) pl.graveyard.push(instanceId);
  fireTrigger(state, 'sentToGraveyard', { instanceId });
}

module.exports = { declareAttack };
