// Rulebook "Estados": Congelado, Quemadura and Envenenado. (Corrosión marks zones, not
// monsters, and lives in zones.js.)
//
// Statuses are stored by card instance id (state.statuses), not on the field entry, because the
// book says a Congelado effect "se mantendrá incluso con el monstruo en el cementerio".
//
// Duration: a status from a monster or support lasts until the end of the turn it was applied;
// one that comes from a compiled monster lasts 2 turns (this one and the next).

const FREEZE = 'Congelado';
const BURN = 'Quemadura';
const POISON = 'Veneno'; // the book's "Envenenado"; the effect data spells it "Veneno"

const BURN_END_OF_TURN_DAMAGE = 5; // per burning monster its controller has, every end of turn

function addStatus(state, instanceId, type, { sourceInstanceId = null, fromCompiled = false, debuff = null } = {}) {
  state.statuses = state.statuses || {};
  // Re-applying refreshes the status instead of stacking two copies of it.
  const rest = (state.statuses[instanceId] || []).filter((s) => s.type !== type);
  rest.push({ type, sourceInstanceId, debuff, expiresTurn: state.turnNumber + (fromCompiled ? 1 : 0) });
  state.statuses[instanceId] = rest;
}

// Attaches an Atk/Vida penalty to a status that is already on the card ("mientras dure el estado").
function setStatusDebuff(state, instanceId, type, buff) {
  const entry = ((state.statuses && state.statuses[instanceId]) || []).find((s) => s.type === type);
  if (!entry) return false;
  entry.debuff = { atk: (buff.atk || 0), def: (buff.def || 0) };
  return true;
}

function hasStatus(state, instanceId, type) {
  return ((state.statuses && state.statuses[instanceId]) || []).some((s) => s.type === type);
}

function statusesOf(state, instanceId) {
  return ((state.statuses && state.statuses[instanceId]) || []).map((s) => s.type);
}

function clearStatus(state, instanceId, type) {
  if (!state.statuses || !state.statuses[instanceId]) return;
  state.statuses[instanceId] = state.statuses[instanceId].filter((s) => s.type !== type);
  if (!state.statuses[instanceId].length) delete state.statuses[instanceId];
}

// Atk/Vida penalty an Envenenado monster is currently under (the card that applies it says how much).
function poisonDebuff(state, instanceId) {
  const total = { atk: 0, def: 0 };
  ((state.statuses && state.statuses[instanceId]) || []).forEach((s) => {
    if (s.type !== POISON || !s.debuff) return;
    total.atk += s.debuff.atk || 0;
    total.def += s.debuff.def || 0;
  });
  return total;
}

function burningMonsters(state, playerIndex) {
  return state.players[playerIndex].field.monsters.filter((m) => m && hasStatus(state, m.instanceId, BURN));
}

// Called at the end of every turn, after the end-of-turn burn damage has been dealt.
function expireStatuses(state) {
  if (!state.statuses) return;
  Object.keys(state.statuses).forEach((id) => {
    state.statuses[id] = state.statuses[id].filter((s) => s.expiresTurn > state.turnNumber);
    if (!state.statuses[id].length) delete state.statuses[id];
  });
}

module.exports = {
  FREEZE,
  BURN,
  POISON,
  BURN_END_OF_TURN_DAMAGE,
  addStatus,
  setStatusDebuff,
  hasStatus,
  statusesOf,
  clearStatus,
  poisonDebuff,
  burningMonsters,
  expireStatuses,
};
