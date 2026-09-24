// Negating a card's effects, and for how long — the card that negates says it:
//   - "hasta el final del turno" (args.duration "endOfTurn"): until this turn ends;
//   - an Apoyo Continuo/Equipo or any other continuous effect: only while that effect is on the
//     field — recomputed from the board like every other continuous effect
//     (effectEngine.recomputeContinuous sets `negatedByContinuous` fresh each time);
//   - nothing said: permanent, for as long as the negated card stays on the field (a card that
//     leaves and comes back is a new card — zones.removeFromZone clears it).
// For now a negated card only stops firing its triggered effects (effectEngine.fireTrigger);
// blocking its continuous effects and activations is still to come.

// `endOfTurn`-style durations the effect data uses.
const END_OF_TURN = ['endOfTurn', 'thisTurn'];

function negateCard(state, instanceId, { sourceInstanceId = null, duration = null } = {}) {
  state.negations = state.negations || [];
  const expiresTurn = END_OF_TURN.includes(duration) ? state.turnNumber : null;
  // A permanent negation replaces a timed one on the same card rather than stacking beside it.
  state.negations = state.negations.filter((n) => !(n.targetInstanceId === instanceId && (expiresTurn === null || n.expiresTurn !== null)));
  if (state.negations.some((n) => n.targetInstanceId === instanceId && n.expiresTurn === null)) return;
  state.negations.push({ targetInstanceId: instanceId, sourceInstanceId, expiresTurn });
}

function isNegated(state, entry) {
  if (!entry) return false;
  if (entry.negatedByContinuous) return true;
  return (state.negations || []).some((n) => n.targetInstanceId === entry.instanceId && (n.expiresTurn === null || n.expiresTurn >= state.turnNumber));
}

function clearNegations(state, instanceId) {
  if (!state.negations) return;
  state.negations = state.negations.filter((n) => n.targetInstanceId !== instanceId);
}

// Called as a turn ends (before the turn number moves on).
function expireNegations(state) {
  if (!state.negations) return;
  state.negations = state.negations.filter((n) => n.expiresTurn === null || n.expiresTurn > state.turnNumber);
}

module.exports = { negateCard, isNegated, clearNegations, expireNegations, END_OF_TURN };
