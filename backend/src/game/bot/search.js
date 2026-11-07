// Picks the bot's next action: tries every candidate on a determinized copy of the match (see
// simulate.js), lets the line play out, scores the resulting board (evaluate.js) and keeps the
// best — only if it beats doing nothing. One step at a time: the bot looks at what each action
// leads to right away, not at whole sequences of turns.
const { cloneState, determinize, safeApply, settle } = require('./simulate');
const { evaluate } = require('./evaluate');
const { candidateActions } = require('./candidates');
const S = require('./weights').search;

function newBudget() {
  return { sims: 0, until: Date.now() + S.maxMsPerDecision };
}
const outOfBudget = (budget) => budget.sims >= S.maxSimsPerDecision || Date.now() > budget.until;

// An action without its picks — what "the same move" means when one keeps failing.
function signature(action) {
  const { targets, ...rest } = action;
  return JSON.stringify(rest);
}

// The best way to play `action` from `root`, trying each option whenever it asks for a pick
// (a target, a cost, a card to search...), with the score of where that line ends up.
function scoreAction(root, me, action, budget, depth = 0) {
  if (outOfBudget(budget)) return null;
  budget.sims++;
  const sim = cloneState(root);
  const res = safeApply(sim, me, action);
  if (!res) return null;
  if (res.ok) {
    settle(sim);
    return { score: evaluate(sim, me), action };
  }
  if (res.reason !== 'choose-target' || !res.options || !res.options.length || depth >= S.maxPickDepth) return null;
  let best = null;
  res.options.slice(0, depth === 0 ? S.maxOptions : S.maxDeepOptions).forEach((option) => {
    const next = { ...action, targets: [...(action.targets || []), option.instanceId] };
    const result = scoreAction(root, me, next, budget, depth + 1);
    if (result && (!best || result.score > best.score)) best = result;
  });
  return best;
}

// A target picked in the copy, turned back into the real card it stands for.
function toReal(action, back) {
  const map = (id) => (id && back[id]) || id;
  const real = { ...action };
  if (real.targets) real.targets = real.targets.map(map);
  if (real.targetInstanceId) real.targetInstanceId = map(real.targetInstanceId);
  return real;
}

// The action the bot should take now, or null for "nothing worth doing" (move on to the next
// phase / pass the Pila). `banned`: signatures of moves that failed for real this turn.
function chooseAction(state, me, banned = new Set()) {
  const budget = newBudget();
  const { sim, back } = determinize(state, me);
  const pending = sim.pendingTriggerChoices && sim.pendingTriggerChoices[0];

  let options;
  let baseline = -Infinity;
  let fallback = null;
  if (pending) {
    options = pending.kind === 'slot'
      ? pending.slots.map((slot) => ({ type: 'RESOLVE_TRIGGER_CHOICE', slot }))
      : [{ type: 'RESOLVE_TRIGGER_CHOICE', targets: [] }];
  } else if (sim.chain.length) {
    fallback = { type: 'PASS_CHAIN' };
    const pass = scoreAction(sim, me, fallback, budget);
    baseline = pass ? pass.score + S.minGain : -Infinity;
    options = candidateActions(sim, me);
  } else {
    baseline = evaluate(sim, me) + S.minGain;
    options = candidateActions(sim, me);
  }

  let best = null;
  options
    .filter((action) => !banned.has(signature(action)))
    .forEach((action) => {
      const result = scoreAction(sim, me, action, budget);
      if (result && result.score > baseline && (!best || result.score > best.score)) best = result;
    });
  if (!best) return fallback;
  return toReal(best.action, back);
}

module.exports = { chooseAction, scoreAction, signature };
