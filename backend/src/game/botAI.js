const { applyAction } = require('./engine');
const { chooseAction, signature } = require('./bot/search');
const { answerFirst } = require('./bot/simulate');
const S = require('./bot/weights').search;

// The PvE opponent. It plays through the exact same `applyAction` calls a human client would
// send — it's not a separate rules path. Each step it asks bot/search.js for the best move (tried
// out on a copy of the match where it can't see the rival's hidden cards), and moves on to the next
// phase when nothing improves its position. Runs until it has to wait on the human: their turn,
// their priority on the Pila, or a pick only they can make.
function runBotTurn(state, botIndex) {
  const banned = new Set(); // moves that failed for real this turn — not tried again
  const used = new Map(); // how often each move was made, so nothing repeats forever
  const act = (action) => {
    const res = applyAction(state, botIndex, action);
    const key = signature(action);
    if (!res.ok) banned.add(key);
    else {
      used.set(key, (used.get(key) || 0) + 1);
      if (used.get(key) >= 3) banned.add(key);
    }
    return res.ok;
  };

  for (let step = 0; step < S.maxActionsPerTurn && state.status === 'active'; step++) {
    const pending = state.pendingTriggerChoices && state.pendingTriggerChoices[0];
    if (pending) {
      if (pending.controllerIndex !== botIndex) return; // the human's pick
      const choice = chooseAction(state, botIndex, banned);
      if (!(choice && act(choice)) && !answerFirst(state, pending)) return;
      continue;
    }

    // Rulebook, "Apilar": while a Pila is open only the priority holder acts — respond or pass.
    if (state.chain.length) {
      if (state.priorityPlayer !== botIndex) return;
      const choice = chooseAction(state, botIndex, banned);
      if (!(choice && act(choice))) applyAction(state, botIndex, { type: 'PASS_CHAIN' });
      continue;
    }

    if (state.turnPlayer !== botIndex) return;
    if (['main1', 'battle', 'main2'].includes(state.phase)) {
      const choice = chooseAction(state, botIndex, banned);
      if (choice) {
        act(choice);
        continue;
      }
    }
    if (!applyAction(state, botIndex, { type: 'ADVANCE_PHASE' }).ok) return;
  }
}

module.exports = { runBotTurn };
