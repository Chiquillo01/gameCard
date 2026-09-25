// All-or-nothing activations: take a snapshot before paying anything and put it back if the
// activation can't go through after all, so a failed attempt never leaves a cost half-paid (the
// match state is plain data, so a deep copy is a complete snapshot).
function snapshot(state) {
  return structuredClone(state);
}

function restore(state, snap) {
  Object.keys(state).forEach((k) => { delete state[k]; });
  Object.assign(state, snap);
}

module.exports = { snapshot, restore };
