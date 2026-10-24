const { applyAction } = require('./engine');
const { chooseAction, signature } = require('./bot/search');
const { answerFirst } = require('./bot/simulate');
const S = require('./bot/weights').search;

// The PvE opponent. It plays through the exact same `applyAction` calls a human client would
// send — it's not a separate rules path. Each step it asks bot/search.js for the best move (tried
// out on a copy of the match where it can't see the rival's hidden cards), and moves on to the next
// phase when nothing improves its position. It stops when it has to wait on the human: their turn,
// their priority on the Pila, or a pick only they can make.
//
// botStep makes ONE move, so the duel controller can play the bot's turn step by step (with a pause
// between moves the player can follow); runBotTurn plays it all at once (tests, simulations).

// What the bot remembers during one turn: moves that failed for real (not tried again) and how
// often each was made (nothing repeats forever).
// Kept per match object (a WeakMap: it goes away with the match).
const memos = new WeakMap();
function memoFor(state, botIndex) {
  const byBot = memos.get(state) || {};
  let memo = byBot[botIndex];
  if (!memo || memo.turn !== state.turnNumber) {
    memo = { turn: state.turnNumber, banned: new Set(), used: new Map(), steps: 0 };
    byBot[botIndex] = memo;
    memos.set(state, byBot);
  }
  return memo;
}

// One move. Returns 'action' (it did something that matters), 'phase' (it moved to the next
// phase) or null (it has nothing to do now: it's waiting on the human, or the duel is over).
function botStep(state, botIndex) {
  if (state.status !== 'active') return null;
  const memo = memoFor(state, botIndex);
  if (memo.steps++ >= S.maxActionsPerTurn) return null;
  const { banned, used } = memo;
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

  const pending = state.pendingTriggerChoices && state.pendingTriggerChoices[0];
  if (pending) {
    if (pending.controllerIndex !== botIndex) return null; // the human's pick
    // A special summon's position: defense when its Vida is higher than its Atk.
    if (pending.kind === 'position') {
      const m = state.players[botIndex].field.monsters.find((e) => e && e.instanceId === pending.instanceId);
      const stats = m ? require('./effectEngine').getEffectiveStats(m) : { atk: 1, def: 0 };
      applyAction(state, botIndex, { type: 'RESOLVE_TRIGGER_CHOICE', targets: [stats.def > stats.atk ? 'position:defense' : 'position:attack'] });
      return 'action';
    }
    const choice = chooseAction(state, botIndex, banned);
    if (!(choice && act(choice)) && !answerFirst(state, pending)) return null;
    return 'action';
  }

  // Rulebook, "Apilar": while a Pila is open only the priority holder acts — respond or pass.
  if (state.chain.length) {
    if (state.priorityPlayer !== botIndex) return null;
    const choice = chooseAction(state, botIndex, banned);
    if (!(choice && act(choice))) applyAction(state, botIndex, { type: 'PASS_CHAIN' });
    return 'action';
  }

  if (state.turnPlayer !== botIndex) return null;
  if (['main1', 'battle', 'main2'].includes(state.phase)) {
    const choice = chooseAction(state, botIndex, banned);
    if (choice) {
      act(choice);
      return 'action';
    }
  }
  return applyAction(state, botIndex, { type: 'ADVANCE_PHASE' }).ok ? 'phase' : null;
}

function runBotTurn(state, botIndex) {
  for (let step = 0; step < S.maxActionsPerTurn * 2; step++) {
    if (!botStep(state, botIndex)) return;
  }
}

module.exports = { runBotTurn, botStep };
