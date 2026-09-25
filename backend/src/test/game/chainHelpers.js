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

module.exports = { passChain, attackAndResolve };
