const { applyAction } = require('../../game/engine');

// Rulebook, "Apilar": activating a card now opens a response window instead of resolving right
// away. Drains a currently-open Pila exactly like a player clicking "Pasar" (repeatedly, since
// either side could still have something to add) — for tests that aren't about chaining itself
// and just want the effect to have actually resolved.
function passChain(state) {
  let guard = 0;
  while (state.chain.length && guard++ < 20) {
    const res = applyAction(state, state.priorityPlayer, { type: 'PASS_CHAIN' });
    if (!res.ok) throw new Error('passChain: unexpected result ' + JSON.stringify(res));
  }
}

// Declaring an attack always opens a response window; for tests about the battle itself, declare
// it and let both players pass so the battle actually happens. Returns the declaration's result.
function attackAndResolve(state, playerIndex, attackerInstanceId, targetInstanceId = null) {
  const res = applyAction(state, playerIndex, { type: 'DECLARE_ATTACK', attackerInstanceId, targetInstanceId });
  if (res.ok) passChain(state);
  return res;
}

// Answers every queued "where does it go" choice (a card an effect puts on the field) with the
// first free zone, and every "attack or defense" of a special summon with attack — for tests that
// aren't about where or how it lands.
function placePending(state) {
  let guard = 0;
  while (guard++ < 20) {
    const pending = state.pendingTriggerChoices && state.pendingTriggerChoices[0];
    if (!pending || !['slot', 'position'].includes(pending.kind)) return;
    const res = pending.kind === 'position'
      ? applyAction(state, pending.controllerIndex, { type: 'RESOLVE_TRIGGER_CHOICE', targets: ['position:attack'] })
      : applyAction(state, pending.controllerIndex, { type: 'RESOLVE_TRIGGER_CHOICE', slot: pending.slots[0] });
    if (!res.ok) throw new Error('placePending: unexpected result ' + JSON.stringify(res));
  }
}

// Answers every pending choice — zones, positions and picks — with its first option, for tests that
// aren't about what gets picked (the player always makes the pick, even with one candidate).
function resolveAll(state) {
  let guard = 0;
  let picks = [];
  let offered = null; // the options the last answer was asked for
  while (guard++ < 40) {
    const pending = state.pendingTriggerChoices && state.pendingTriggerChoices[0];
    if (!pending) return;
    if (pending.kind === 'slot' || pending.kind === 'position') { placePending(state); picks = []; offered = null; continue; }
    const options = offered || (pending.kind === 'discard' ? state.players[pending.controllerIndex].hand.map((id) => ({ instanceId: id })) : pending.options);
    picks = [...picks, options[0].instanceId];
    const res = applyAction(state, pending.controllerIndex, { type: 'RESOLVE_TRIGGER_CHOICE', targets: picks });
    if (res.reason === 'choose-target' && res.options && res.options.length) { offered = res.options; continue; }
    picks = [];
    offered = null;
    while (state.chain && state.chain.length && guard++ < 40) applyAction(state, state.priorityPlayer, { type: 'PASS_CHAIN' });
  }
}

// Applies `action`, adding the first option offered each time the server asks for a pick.
function actPicking(state, playerIndex, action) {
  let next = { ...action, targets: [...(action.targets || [])] };
  for (let i = 0; i < 10; i++) {
    const res = applyAction(state, playerIndex, next);
    if (res.reason !== 'choose-target' || !res.options || !res.options.length) return res;
    next = { ...next, targets: [...next.targets, res.options[0].instanceId] };
  }
  return { ok: false, reason: 'too-many-picks' };
}

module.exports = { passChain, attackAndResolve, placePending, resolveAll, actPicking };
