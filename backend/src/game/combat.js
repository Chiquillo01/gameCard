const { getCard, getEffect } = require('./cardIndex');
const { player, opponentIndex, moveToZone, log, getFieldMonster } = require('./zones');
const { hasStatus, FREEZE, BURN } = require('./statuses');
const { cardIdFromInstance } = require('./deckUtils');
const { getEffectiveStats, fireTrigger, recomputeContinuous } = require('./effectEngine');
const { checkWin } = require('./outcome');

function isWater(entry) {
  return !entry.isToken && !entry.faceDown && getCard(entry.cardId).attribute === 'Agua';
}

const hasAbility = (m, name) => (m.abilities || []).some((a) => a.name === name);

// How many attacks a monster gets this turn: 1, plus a turn's extra (Bálor, Orco Gladiador) and a
// standing one (Héroe del Caos "puede pegar dos veces", Damarco one per material).
function allowedAttacks(state, m) {
  const turnExtra = m.extraAttacksTurn && m.extraAttacksTurn.turn === state.turnNumber ? m.extraAttacksTurn.count : 0;
  return 1 + turnExtra + (m.extraAttacksContinuous || 0);
}

// Whether it still has an attack left this turn (a monster that just came back from a
// decompilation, or was just taken over, can't attack the turn that happened).
function canStillAttack(state, m) {
  if (m.attackLockTurn === state.turnNumber) return false;
  return (m.attacksThisTurn || 0) < allowedAttacks(state, m);
}

// Declaring an attack doesn't resolve it on the spot: it opens a response window (the attack is
// the bottom link of the Pila, see chain.js) so the defender can answer with a Speed 2+ card —
// Trampa de Madera "cuando un monstruo declara un ataque directo". When the defender has nothing
// that could possibly respond, the battle just happens.
function declareAttack(state, controllerIndex, attackerInstanceId, targetInstanceId /* null = direct */) {
  if (state.phase !== 'battle') return { ok: false, reason: 'not-battle-phase' };
  if (state.turnPlayer !== controllerIndex) return { ok: false, reason: 'not-your-turn' };
  // Paseo Temporal: "no puedes atacar este turno".
  if (state.attackBans && state.attackBans[controllerIndex] === state.turnNumber) return { ok: false, reason: 'attacks-disabled' };

  const attackerPl = player(state, controllerIndex);
  const attacker = attackerPl.field.monsters.find((m) => m && m.instanceId === attackerInstanceId);
  if (!attacker) return { ok: false, reason: 'attacker-not-found' };
  if (!canStillAttack(state, attacker)) return { ok: false, reason: 'already-attacked' };
  // Relicario de Engranaje: "pueden atacar este turno en Posición de Defensa boca arriba".
  const canAttackFromDefense = attacker.position === 'defense' && !attacker.faceDown && hasAbility(attacker, 'attackInDefense');
  if (attacker.position !== 'attack' && !canAttackFromDefense) return { ok: false, reason: 'not-in-attack-position' };

  const oppIdx = opponentIndex(controllerIndex);
  const oppPl = player(state, oppIdx);
  if (!targetInstanceId) {
    // Motor de Engranaje "no puede ser objetivo de ataques": a board of only those doesn't stop a
    // direct attack. Homúnculo/Acechador Invisible "puede atacar directamente" ignore the board.
    const attackable = oppPl.field.monsters.some((m) => m && !m.untargetable);
    if (attackable && !attacker.canAttackDirectly) return { ok: false, reason: 'must-target-a-monster' };
  } else {
    const defender = oppPl.field.monsters.find((m) => m && m.instanceId === targetInstanceId);
    if (!defender) return { ok: false, reason: 'defender-not-found' };
    if (defender.untargetable) return { ok: false, reason: 'cannot-be-targeted' };
  }

  attacker.attacksThisTurn = (attacker.attacksThisTurn || 0) + 1;
  attacker.hasAttacked = !canStillAttack(state, attacker);
  const name = attacker.isToken ? attacker.tokenDef.name : getCard(attacker.cardId).name;
  const link = { kind: 'attack', controllerIndex, attackerInstanceId, targetInstanceId: targetInstanceId || null, sourceInstanceId: attackerInstanceId, cardName: `Ataque de ${name}`, speed: 1 };
  if (!canRespondToAttack(state, oppIdx, link)) {
    return { ok: true, direct: !targetInstanceId, ...(performBattle(state, link) || {}) };
  }
  require('./chain').addAttackLink(state, link);
  return { ok: true, direct: !targetInstanceId, responseWindow: true };
}

// Whether the defender holds anything that could be used right now in answer to this attack: an
// Apoyo Veloz/Contraataque in hand or set, or a Speed 2+ effect of theirs on the field or in hand,
// whose own "cuando..." (if it has one) matches the attack.
function canRespondToAttack(state, playerIndex, link) {
  const { responseWindowOpen } = require('./chain');
  const { requiredZoneFor } = require('./effectEngine');
  const pl = player(state, playerIndex);
  const effectsOf = (cardId) => (getCard(cardId).effectCodes || []).map(getEffect).filter(Boolean);
  const opens = (effect) => responseWindowOpen(state, playerIndex, effect, link);
  const fastSupport = (card) => card.category === 'support' && (card.subtype === 'instant' || card.subtype === 'counter');
  const supportCanAnswer = (card) => {
    const cost = card.activationCost;
    if (cost && cost.fn === 'payPixels' && pl.pixelcoins < ((cost.args && cost.args.amount) || 0)) return false;
    const playable = effectsOf(card._id.toString()).filter((e) => ['activated', 'quick', 'ignition'].includes(e.type) && !['graveyard', 'banished'].includes(requiredZoneFor(e)));
    return playable.some(opens);
  };
  const handAnswers = pl.hand.some((id) => {
    const card = getCard(cardIdFromInstance(id));
    if (fastSupport(card)) return supportCanAnswer(card);
    return effectsOf(card._id.toString()).some((e) => e.type === 'quick' && requiredZoneFor(e) === 'hand' && opens(e));
  });
  const setAnswers = pl.field.support.some((s) => s && s.faceDown && fastSupport(getCard(s.cardId)) && supportCanAnswer(getCard(s.cardId)));
  const fieldAnswers = pl.field.monsters.some((m) => m && !m.faceDown && !m.isToken && effectsOf(m.cardId).some((e) => e.type === 'quick' && !requiredZoneFor(e) && opens(e)));
  return handAnswers || setAnswers || fieldAnswers;
}

// The battle itself, once the attack's response window has closed without it being negated.
function performBattle(state, link) {
  const controllerIndex = link.controllerIndex;
  const attackerPl = player(state, controllerIndex);
  const oppIdx = opponentIndex(controllerIndex);
  const oppPl = player(state, oppIdx);
  const attacker = getFieldMonster(state, link.attackerInstanceId);
  if (!attacker || !attackerPl.field.monsters.includes(attacker)) {
    log(state, 'El monstruo atacante ya no está en el Campo: no hay batalla.');
    return;
  }
  const attackerName = attacker.isToken ? attacker.tokenDef.name : getCard(attacker.cardId).name;

  if (!link.targetInstanceId) {
    // "Antes de la fase de daño" (Serpiente de Muelle) for a direct attack too.
    fireTrigger(state, 'beforeDamageCalculation', { instanceId: attacker.instanceId, attackerInstanceId: attacker.instanceId, defenderInstanceId: null });
    if (!getFieldMonster(state, attacker.instanceId)) return;
    const atk = getEffectiveStats(attacker).atk;
    oppPl.vp = Math.max(0, oppPl.vp - atk);
    log(state, `${attackerPl.userId} ataca directamente con ${attackerName}: ${atk} de daño (VP: ${oppPl.vp}).`);
    if (atk > 0) damageEvents(state, attacker, controllerIndex, true);
    recomputeContinuous(state);
    checkWin(state);
    return;
  }

  let defender = oppPl.field.monsters.find((m) => m && m.instanceId === link.targetInstanceId);
  if (!defender) {
    log(state, 'El monstruo atacado ya no está en el Campo: el ataque no llega.');
    return;
  }
  // "Si se involucra a un monstruo Héroe en una batalla" (Héroe de la Esperanza).
  fireTrigger(state, 'involvedInBattle', { attackerInstanceId: attacker.instanceId, defenderInstanceId: defender.instanceId });
  // "Antes de la fase de daño" (Serpiente de Muelle: sube a la Mano esta carta y al defensor).
  fireTrigger(state, 'beforeDamageCalculation', { instanceId: attacker.instanceId, attackerInstanceId: attacker.instanceId, defenderInstanceId: defender.instanceId });
  if (!getFieldMonster(state, attacker.instanceId) || !getFieldMonster(state, defender.instanceId)) {
    log(state, 'Uno de los monstruos dejó el Campo antes del daño: no hay batalla.');
    return;
  }
  defender = getFieldMonster(state, defender.instanceId);

  // Rulebook: a face-down defender is turned face-up during the damage step so its Vida can be
  // read; its Rotación effects trigger after damage, if it's still on the field.
  const wasFaceDown = defender.faceDown;
  if (wasFaceDown) defender.faceDown = false;
  const attackerStats = getEffectiveStats(attacker);
  const defenderStats = getEffectiveStats(defender);

  // Rulebook, Congelado: a frozen monster fighting a water monster (either way round) is destroyed
  // before the damage step, so no damage is dealt.
  const attackerFrozen = hasStatus(state, attacker.instanceId, FREEZE);
  const defenderFrozen = hasStatus(state, defender.instanceId, FREEZE);
  if ((attackerFrozen && isWater(defender)) || (defenderFrozen && isWater(attacker))) {
    if (attackerFrozen && isWater(defender)) destroyInBattle(state, controllerIndex, attacker, defender);
    else destroyInBattle(state, oppIdx, defender, attacker);
    log(state, 'Un monstruo congelado es destruido por el agua.');
    if (wasFaceDown && getFieldMonster(state, defender.instanceId)) fireTrigger(state, 'flipped', { instanceId: defender.instanceId, attackerInstanceId: attacker.instanceId });
    recomputeContinuous(state);
    checkWin(state);
    return;
  }

  // Rulebook, Quemadura: a burning monster takes double damage from attacks it is part of.
  const burnMultiplier = (m) => (hasStatus(state, m.instanceId, BURN) ? 2 : 1);
  let damageToDefenderSide = 0;
  let damageToAttackerSide = 0;
  const loseVp = (pl, amount, involved) => {
    const lost = amount * burnMultiplier(involved);
    pl.vp = Math.max(0, pl.vp - lost);
    return lost;
  };

  let destroyedAttacker = false;
  let destroyedDefender = false;

  if (defender.position === 'attack') {
    if (attackerStats.atk > defenderStats.atk) destroyedDefender = true;
    if (defenderStats.atk > attackerStats.atk) destroyedAttacker = true;
    if (attackerStats.atk === defenderStats.atk && attackerStats.atk > 0) { destroyedAttacker = true; destroyedDefender = true; }
    if (destroyedDefender && !destroyedAttacker) damageToDefenderSide = loseVp(oppPl, attackerStats.atk - defenderStats.atk, defender);
    if (destroyedAttacker && !destroyedDefender) damageToAttackerSide = loseVp(attackerPl, defenderStats.atk - attackerStats.atk, attacker);
  } else {
    // Defending in defense position (rulebook): ATK > Vida destroys the defender with no VP loss;
    // ATK = Vida destroys nothing; ATK < Vida leaves both alive and the attacker's owner loses
    // the difference (Vida - ATK) in VP.
    if (attackerStats.atk > defenderStats.def) destroyedDefender = true;
    else if (attackerStats.atk < defenderStats.def) {
      damageToAttackerSide = loseVp(attackerPl, defenderStats.def - attackerStats.atk, attacker);
    }
  }

  if (defender.cannotBeDestroyedByBattle) destroyedDefender = false;
  if (attacker.cannotBeDestroyedByBattle) destroyedAttacker = false;
  log(state, `${attackerPl.userId} ataca con ${attackerName}.`);
  if (destroyedDefender) destroyInBattle(state, oppIdx, defender, attacker);
  if (destroyedAttacker) destroyInBattle(state, controllerIndex, attacker, defender);
  if (wasFaceDown && !destroyedDefender && getFieldMonster(state, defender.instanceId)) fireTrigger(state, 'flipped', { instanceId: defender.instanceId, attackerInstanceId: attacker.instanceId });

  // "Si inflige daño de batalla" (Acechador Invisible) / "si esta carta hace daño a tu oponente"
  // (Esqueleto de relámpago): whichever monster's side made the other player lose VP.
  if (damageToDefenderSide > 0) damageEvents(state, attacker, controllerIndex, false);
  if (damageToAttackerSide > 0) damageEvents(state, defender, oppIdx, false);

  fireTrigger(state, 'onBattlePhase', {});
  recomputeContinuous(state);
  checkWin(state);
  return { destroyedAttacker, destroyedDefender };
}

// Battle damage `dealer` (controlled by `controllerIndex`) just dealt to the rival.
function damageEvents(state, dealer, controllerIndex, direct) {
  if (dealer.isToken) return;
  const event = { instanceId: dealer.instanceId, cardId: dealer.cardId, controllerIndex };
  fireTrigger(state, 'battleDamageDealt', event);
  fireTrigger(state, 'dealsDamageToOpponent', event);
  // "Cada vez que un monstruo de TIERRA inflige daño directo" (Relicario), Gigante Elemental.
  if (direct) fireTrigger(state, 'direct_damage_dealt', event);
}

// A monster destroyed in battle: to its owner's Cementerio (a token just disappears), then its own
// "cuando es enviada al Cementerio"/"si es destruida en batalla" effects and the destroyer's
// "cuando destruye un monstruo en batalla" (Matón).
function destroyInBattle(state, ownerIndex, victim, destroyer) {
  const pl = player(state, ownerIndex);
  const idx = pl.field.monsters.indexOf(victim);
  if (idx === -1) return;
  if (victim.isToken) {
    pl.field.monsters[idx] = null;
  } else {
    // moveToZone also releases the materials under a compiled monster and ends its burning.
    moveToZone(state, victim.instanceId, 'graveyard');
    const event = { instanceId: victim.instanceId, cardId: cardIdFromInstance(victim.instanceId), ownerIndex: require('./zones').ownerOfInstance(victim.instanceId) ?? ownerIndex, reason: 'battle' };
    fireTrigger(state, 'sentToGraveyard', event);
    fireTrigger(state, 'onMonsterDestroyed', event);
  }
  if (destroyer && getFieldMonster(state, destroyer.instanceId)) {
    fireTrigger(state, 'destroysMonsterInBattle', { instanceId: destroyer.instanceId, victimInstanceId: victim.instanceId });
  }
}

module.exports = { declareAttack, performBattle, canStillAttack, allowedAttacks, canRespondToAttack };
