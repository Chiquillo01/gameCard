// Rulebook, "Apilar" / "Velocidades": activating a card doesn't resolve it on the spot — it goes
// onto the Pila (chain) and the other player always gets a window to respond (or pass) before
// anything actually happens. Both players keep adding links or passing until two passes happen in
// a row, then the chain resolves top-to-bottom (LIFO — the most recently added link first).
//
// Declaring an attack opens the same kind of window (see combat.js): the attack is the bottom link
// of the Pila, so Speed 2+ cards (Trampa de Madera...) can respond before any damage is dealt.
const { getCard } = require('./cardIndex');
const { player, opponentIndex, moveToZone, log } = require('./zones');

// Speed 1: most monster effects (anything but Efecto Rápido) and Apoyo Normal/Equipo/Continuo/
//          Tierra — can never respond to something already on the Pila.
// Speed 2: Efecto Rápido (monster), Apoyo Veloz (instant) — can respond to Speed 1 or 2.
// Speed 3: Apoyo Contraefecto (counter) — can respond to anything; only another Speed 3 can
//          respond back to it.
const SUPPORT_SPEED = { instant: 2, counter: 3 };
function speedOf(card, effect) {
  if (card.category === 'support') return SUPPORT_SPEED[card.subtype] || 1;
  return effect && effect.type === 'quick' ? 2 : 1;
}

const isMainPhase = (state) => state.phase === 'main1' || state.phase === 'main2';

// Why `controllerIndex` can't add a link of this speed right now, or null if they can.
//   - Empty Pila, Speed 1: only the turn player, only in their Fase Principal (Rulebook — the
//     rival can't start a Speed 1 effect during your turn, nor anyone during draw/battle/end).
//   - Empty Pila, Speed 2+: any time (whose turn it is being checked by the caller).
//   - Open Pila: holding priority, Speed 2+, and at least as fast as the link on top.
function linkBlockReason(state, controllerIndex, speed) {
  if (!state.chain.length) {
    if (speed >= 2) return null;
    if (state.turnPlayer !== controllerIndex) return 'not-your-turn';
    return isMainPhase(state) ? null : 'not-main-phase';
  }
  if (state.priorityPlayer !== controllerIndex) return 'not-your-priority';
  const top = state.chain[state.chain.length - 1];
  return speed >= 2 && speed >= top.speed ? null : 'too-slow';
}

function canAddLink(state, controllerIndex, speed) {
  return linkBlockReason(state, controllerIndex, speed) === null;
}

// Places a card's activation on the Pila and hands priority to the other player instead of
// resolving it immediately.
//   sourceInstanceId — the activating card.
//   effects          — the effect definition(s) that will run once this link resolves.
//   targets          — whatever was chosen at activation time (search picks, targets, options...).
//   costPaid         — the cards the activation cost used (Orco Gladiador's "si el monstruo
//                      sacrificado es un Orco", Licántropo Mago's milled card...).
//   afterResolve     — 'graveyard' to send the source there once it resolves (Normal/Veloz/
//                      Contraataque support cards); null to leave it where it is (Continuo/Equipo/
//                      Tierra stay on the field; a monster's own ignition/quick ability isn't a
//                      card by itself).
function addLink(state, { controllerIndex, sourceInstanceId, cardName, effects, targets, speed, afterResolve = null, costPaid = [] }) {
  state.chain.push({ controllerIndex, sourceInstanceId, cardName, effects, targets, speed, afterResolve, costPaid });
  state.priorityPlayer = opponentIndex(controllerIndex);
  state.chainLastActionWasPass = false;
  log(state, `${player(state, controllerIndex).userId} activa ${cardName} (se abre una ventana para responder).`);
  // Lich: "Tu oponente pierde 5 VP cada vez que activa un efecto" (recomputeContinuous keeps the
  // tax on whoever it applies to).
  const pl = player(state, controllerIndex);
  if (pl.activationTax) {
    pl.vp = Math.max(0, pl.vp - pl.activationTax);
    log(state, `${pl.userId} pierde ${pl.activationTax} VP por activar un efecto (VP: ${pl.vp}).`);
    require('./outcome').checkWin(state);
  }
}

// The attack as the bottom link of its own response window (combat.js declareAttack).
// `chainLastActionWasPass` starts true: declaring the attack is the attacker's own pass, so the
// defender passing back resolves it at once.
function addAttackLink(state, { controllerIndex, attackerInstanceId, targetInstanceId, cardName }) {
  state.chain.push({ kind: 'attack', controllerIndex, sourceInstanceId: attackerInstanceId, attackerInstanceId, targetInstanceId, cardName, effects: [], targets: [], speed: 1 });
  state.priorityPlayer = opponentIndex(controllerIndex);
  state.chainLastActionWasPass = true;
  const target = targetInstanceId && require('./zones').getFieldMonster(state, targetInstanceId);
  const targetName = !targetInstanceId ? 'directamente a sus VP' : target && !target.faceDown ? `a ${target.isToken ? target.tokenDef.name : require('./cardIndex').getCard(target.cardId).name}` : 'a un monstruo boca abajo';
  log(state, `${player(state, controllerIndex).userId} declara un ataque: ${cardName.replace(/^Ataque de /, '')} ataca ${targetName} (el rival puede responder).`);
}

// The priority holder declines to add anything. Two passes back to back — nobody having added a
// link in between — resolves the whole Pila.
function passPriority(state, controllerIndex) {
  if (!state.chain.length) return { ok: false, reason: 'no-chain' };
  if (state.priorityPlayer !== controllerIndex) return { ok: false, reason: 'not-your-priority' };
  if (state.chainLastActionWasPass) {
    resolveChain(state);
    return { ok: true };
  }
  state.chainLastActionWasPass = true;
  state.priorityPlayer = opponentIndex(controllerIndex);
  log(state, `${player(state, controllerIndex).userId} no responde.`);
  return { ok: true };
}

// Resolves the Pila top-to-bottom. A link's own actions can pop a still-pending link off
// `state.chain` to negate it (effects/actions.js negateActivation / negateAndSendToGraveyard) —
// since this loop re-checks `state.chain.length` after every resolution, a negated link is simply
// never reached, exactly as the rulebook describes ("niega dicho efecto").
function resolveChain(state) {
  // Lazy require: effectEngine.js requires this module too (to queue a link), so a top-level
  // require here would be circular.
  const { resolveActions, recomputeContinuous } = require('./effectEngine');
  const { checkWin } = require('./outcome');
  while (state.chain.length) {
    const link = state.chain.pop();
    if (link.kind === 'attack') {
      if (link.negated) log(state, `${link.cardName}: el ataque es negado.`);
      else require('./combat').performBattle(state, link);
      continue;
    }
    (link.effects || []).forEach((effect) => {
      resolveActions({ state, controllerIndex: link.controllerIndex, sourceInstanceId: link.sourceInstanceId, effect, costPaid: link.costPaid || [] }, effect, link.targets);
    });
    log(state, `Se resuelve ${link.cardName}.`);
    if (link.afterResolve === 'graveyard') moveToZone(state, link.sourceInstanceId, 'graveyard');
  }
  state.priorityPlayer = state.turnPlayer;
  state.chainLastActionWasPass = false;
  recomputeContinuous(state);
  checkWin(state);
  // Trampa de Madera: "Niega el ataque y termina la Fase de Batalla" — the phase ends once the Pila
  // that asked for it is done.
  if (state.endBattlePhaseRequested) {
    state.endBattlePhaseRequested = false;
    if (state.status === 'active' && state.phase === 'battle') require('./turns').advancePhase(state);
  }
}

// --- Response windows -------------------------------------------------------------------------
// Effects whose trigger names something happening on the Pila can only be activated while exactly
// that is on top of it: Djinni "cuando tu oponente activa el efecto de una carta", Contrataque de
// Batalla "cuando es activado el efecto de un monstruo en la Fase de Batalla", Kraken/Rakshasa "si se
// activa un efecto que incluya...", Trampa de Madera "cuando un monstruo declara un ataque directo".
const RESPONSE_TRIGGERS = ['card_effect_activated', 'monster_effect_activated', 'chainResponse', 'opponentDirectAttackDeclared', 'attackDeclared'];

function isResponseEffect(effect) {
  return !!(effect && effect.trigger && RESPONSE_TRIGGERS.includes(effect.trigger.fn));
}

function phaseMatches(state, phase) {
  if (!phase || phase === 'all') return true;
  if (phase === 'main') return isMainPhase(state);
  if (phase === 'battle') return state.phase === 'battle';
  return state.phase === phase;
}

// True when `effect` (activated by `controllerIndex`) may be used against `top` (the Pila's top
// link, by default). Effects that don't respond to anything are always "open".
function responseWindowOpen(state, controllerIndex, effect, top = state.chain[state.chain.length - 1]) {
  if (!isResponseEffect(effect)) return true;
  const args = effect.trigger.args || {};
  if (!top || !phaseMatches(state, args.phase)) return false;
  const byOpponent = top.controllerIndex !== controllerIndex;
  switch (effect.trigger.fn) {
    case 'chainResponse':
      return top.kind !== 'attack';
    case 'card_effect_activated': {
      if (top.kind === 'attack') return false;
      if (args.source === 'opponent' && !byOpponent) return false;
      if (args.cardType) {
        const category = getCard(top.sourceInstanceId.split(':')[1]).category;
        const wanted = { support: 'support', apoyo: 'support', monster: 'monster', monstruo: 'monster' }[String(args.cardType).toLowerCase()] || args.cardType;
        if (wanted === 'monster' ? !['monster', 'fusion'].includes(category) : category !== wanted) return false;
      }
      return true;
    }
    case 'monster_effect_activated':
      return top.kind !== 'attack' && ['monster', 'fusion'].includes(getCard(top.sourceInstanceId.split(':')[1]).category);
    case 'opponentDirectAttackDeclared':
      return top.kind === 'attack' && !top.targetInstanceId && byOpponent;
    case 'attackDeclared':
      return top.kind === 'attack' && byOpponent;
    default:
      return false;
  }
}

module.exports = { speedOf, canAddLink, linkBlockReason, addLink, addAttackLink, passPriority, resolveChain, responseWindowOpen, isResponseEffect };
