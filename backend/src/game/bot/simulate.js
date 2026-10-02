// Trying an action without touching the real duel: a copy of the match where everything the bot
// can't see has been dealt again at random ("determinized"), so its choices never rely on the
// rival's hand, the order of either Mazo, or what the rival's face-down cards really are.
const { applyAction } = require('../engine');
const { recomputeContinuous } = require('../effectEngine');
const { getCard } = require('../cardIndex');
const { cardIdFromInstance } = require('../deckUtils');

// A copy of the match without its log (the biggest part of it, and nothing in the rules reads it).
function cloneState(state) {
  const log = state.log;
  state.log = [];
  try {
    return structuredClone(state);
  } finally {
    state.log = log;
  }
}

function shuffle(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const categoryOf = (id) => getCard(cardIdFromInstance(id)).category;

// Returns { sim, back }: the copy, and for each rival face-down card that got another identity in
// it, sim id -> real id (to turn a target picked in the copy back into the real card).
function determinize(state, me) {
  const sim = cloneState(state);
  const opp = sim.players[1 - me];
  const back = {};
  // Every card of the rival the bot can't see, shuffled together: hand, Mazo, and face-down cards.
  const hidden = shuffle([...opp.hand, ...opp.deck]);
  const swapIn = (entry, wanted) => {
    const i = hidden.findIndex((id) => (wanted === 'monster' ? categoryOf(id) === 'monster' : categoryOf(id) === 'support'));
    if (i === -1) return;
    const newId = hidden[i];
    hidden[i] = entry.instanceId;
    back[newId] = entry.instanceId;
    if (sim.statuses && sim.statuses[entry.instanceId]) {
      sim.statuses[newId] = sim.statuses[entry.instanceId];
      delete sim.statuses[entry.instanceId];
    }
    const card = getCard(cardIdFromInstance(newId));
    entry.instanceId = newId;
    entry.cardId = card._id.toString();
    if (wanted === 'monster') {
      entry.baseAtk = card.atk || 0;
      entry.baseDef = card.def || 0;
    }
  };
  opp.field.monsters.forEach((m) => { if (m && m.faceDown && !m.isToken) swapIn(m, 'monster'); });
  opp.field.support.forEach((s) => { if (s && s.faceDown) swapIn(s, 'support'); });
  opp.hand = hidden.slice(0, opp.hand.length);
  opp.deck = hidden.slice(opp.hand.length);
  // The bot doesn't know the order of its own Mazo either.
  sim.players[me].deck = shuffle(sim.players[me].deck);
  recomputeContinuous(sim);
  return { sim, back };
}

// applyAction, but an engine error in a simulated line just makes that line "not possible".
function safeApply(state, playerIndex, action) {
  try {
    return applyAction(state, playerIndex, action);
  } catch (e) {
    return null;
  }
}

// Answers a pending choice with its first option (for whoever has to answer it) — used to play a
// simulated line to a stable board, not for the bot's own real choices.
function answerFirst(state, pending) {
  const who = pending.controllerIndex;
  if (pending.kind === 'slot') return !!(safeApply(state, who, { type: 'RESOLVE_TRIGGER_CHOICE', slot: pending.slots[0] }) || {}).ok;
  const targets = [];
  for (let round = 0; round < 20; round++) {
    const res = safeApply(state, who, { type: 'RESOLVE_TRIGGER_CHOICE', targets });
    if (!res) return false;
    if (res.ok) return true;
    if (res.reason !== 'choose-target' || !res.options || !res.options.length) return false;
    targets.push(res.options[0].instanceId);
  }
  return false;
}

// Plays a simulated line on until nothing is waiting: open Pilas resolve with both players passing
// (the bot doesn't guess what the rival would respond with) and pending picks take the first option.
function settle(state) {
  for (let guard = 0; guard < 40 && state.status === 'active'; guard++) {
    const pending = state.pendingTriggerChoices && state.pendingTriggerChoices[0];
    if (pending) {
      if (!answerFirst(state, pending)) return;
      continue;
    }
    if (state.chain.length) {
      const res = safeApply(state, state.priorityPlayer, { type: 'PASS_CHAIN' });
      if (!res || !res.ok) return;
      continue;
    }
    return;
  }
}

module.exports = { cloneState, determinize, safeApply, settle, answerFirst };
