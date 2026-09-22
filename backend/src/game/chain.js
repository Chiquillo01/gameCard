// Rulebook, "Apilar" / "Velocidades": activating a card doesn't resolve it on the spot — it goes
// onto the Pila (chain) and the other player always gets a window to respond (or pass) before
// anything actually happens. Both players keep adding links or passing until two passes happen in
// a row, then the chain resolves top-to-bottom (LIFO — the most recently added link first).
const { getEffect, getCard } = require('./cardIndex');
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

// Whether `controllerIndex` may add a link of this speed right now. Opening a fresh Pila (it's
// currently empty) is always speed-legal — whether it's actually their turn to do so is the
// caller's job (the usual turnPlayer/priority checks). Adding to an already-open one requires
// holding priority, Speed 2+, and at least as fast as the link on top.
function canAddLink(state, controllerIndex, speed) {
  if (!state.chain.length) return true;
  if (state.priorityPlayer !== controllerIndex) return false;
  const top = state.chain[state.chain.length - 1];
  return speed >= 2 && speed >= top.speed;
}

// Places a card's activation on the Pila and hands priority to the other player instead of
// resolving it immediately.
//   sourceInstanceId — the activating card.
//   effects          — the effect definition(s) that will run once this link resolves.
//   targets          — whatever was chosen at activation time (search picks, equip target, ...).
//   afterResolve     — 'graveyard' to send the source there once it resolves (Normal/Veloz/
//                      Contraataque support cards); null to leave it where it is (Continuo/Equipo/
//                      Tierra stay on the field; a monster's own ignition/quick ability isn't a
//                      card by itself).
function addLink(state, { controllerIndex, sourceInstanceId, cardName, effects, targets, speed, afterResolve = null }) {
  state.chain.push({ controllerIndex, sourceInstanceId, cardName, effects, targets, speed, afterResolve });
  state.priorityPlayer = opponentIndex(controllerIndex);
  state.chainLastActionWasPass = false;
  log(state, `${player(state, controllerIndex).userId} activa ${cardName} (se abre una ventana para responder).`);
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
  const { checkWin } = require('./effects/actions');
  while (state.chain.length) {
    const link = state.chain.pop();
    (link.effects || []).forEach((effect) => {
      resolveActions({ state, controllerIndex: link.controllerIndex, sourceInstanceId: link.sourceInstanceId, effect }, effect, link.targets);
    });
    log(state, `Se resuelve ${link.cardName}.`);
    if (link.afterResolve === 'graveyard') moveToZone(state, link.sourceInstanceId, 'graveyard', link.controllerIndex);
  }
  state.priorityPlayer = state.turnPlayer;
  state.chainLastActionWasPass = false;
  recomputeContinuous(state);
  checkWin(state);
}

module.exports = { speedOf, canAddLink, addLink, passPriority, resolveChain };
