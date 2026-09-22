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

module.exports = { passChain };
