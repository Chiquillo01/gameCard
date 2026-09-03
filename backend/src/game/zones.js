const { getCard } = require('./cardIndex');

function player(state, idx) {
  return state.players[idx];
}

function opponentIndex(idx) {
  return idx === 0 ? 1 : 0;
}

function findInstanceLocation(state, instanceId) {
  for (let p = 0; p < 2; p++) {
    const pl = state.players[p];
    if (pl.hand.includes(instanceId)) return { zone: 'hand', ownerIndex: p };
    if (pl.deck.includes(instanceId)) return { zone: 'deck', ownerIndex: p };
    if (pl.extra.includes(instanceId)) return { zone: 'extra', ownerIndex: p };
    if (pl.graveyard.includes(instanceId)) return { zone: 'graveyard', ownerIndex: p };
    if (pl.banished.includes(instanceId)) return { zone: 'banished', ownerIndex: p };
    const mIdx = pl.field.monsters.findIndex((m) => m && m.instanceId === instanceId);
    if (mIdx !== -1) return { zone: 'field:monster', ownerIndex: p, slot: mIdx };
    const sIdx = pl.field.support.findIndex((s) => s && s.instanceId === instanceId);
    if (sIdx !== -1) return { zone: 'field:support', ownerIndex: p, slot: sIdx };
    if (pl.field.territory && pl.field.territory.instanceId === instanceId) return { zone: 'field:territory', ownerIndex: p };
  }
  return null;
}

function getFieldMonster(state, instanceId) {
  const loc = findInstanceLocation(state, instanceId);
  if (!loc || loc.zone !== 'field:monster') return null;
  return state.players[loc.ownerIndex].field.monsters[loc.slot];
}

function getFieldSupport(state, instanceId) {
  const loc = findInstanceLocation(state, instanceId);
  if (!loc || loc.zone !== 'field:support') return null;
  return state.players[loc.ownerIndex].field.support[loc.slot];
}

function removeFromZone(state, instanceId, loc) {
  const pl = state.players[loc.ownerIndex];
  if (loc.zone === 'hand') pl.hand = pl.hand.filter((i) => i !== instanceId);
  else if (loc.zone === 'deck') pl.deck = pl.deck.filter((i) => i !== instanceId);
  else if (loc.zone === 'extra') pl.extra = pl.extra.filter((i) => i !== instanceId);
  else if (loc.zone === 'graveyard') pl.graveyard = pl.graveyard.filter((i) => i !== instanceId);
  else if (loc.zone === 'banished') pl.banished = pl.banished.filter((i) => i !== instanceId);
  else if (loc.zone === 'field:monster') pl.field.monsters[loc.slot] = null;
  else if (loc.zone === 'field:support') pl.field.support[loc.slot] = null;
  else if (loc.zone === 'field:territory') pl.field.territory = null;
}

function findEmptySlot(arr) {
  return arr.findIndex((s) => s === null);
}

function log(state, message) {
  state.log.push({ turn: state.turnNumber, phase: state.phase, message, at: Date.now() });
  if (state.log.length > 300) state.log.shift();
}

// Moves a card instance from wherever it currently is into a simple (non-field) zone.
function moveToZone(state, instanceId, toZone, ownerIndexOverride) {
  const loc = findInstanceLocation(state, instanceId);
  const ownerIndex = ownerIndexOverride ?? (loc ? loc.ownerIndex : null);
  if (ownerIndex === null) return false;
  if (loc) removeFromZone(state, instanceId, loc);
  const pl = state.players[ownerIndex];
  if (toZone === 'hand') pl.hand.push(instanceId);
  else if (toZone === 'deck') pl.deck.unshift(instanceId);
  else if (toZone === 'graveyard') pl.graveyard.push(instanceId);
  else if (toZone === 'banished') pl.banished.push(instanceId);
  else return false;
  return true;
}

// Puts a card instance onto the field as a monster.
function placeMonster(state, instanceId, ownerIndex, { position = 'attack', faceDown = false } = {}) {
  const loc = findInstanceLocation(state, instanceId);
  if (loc) removeFromZone(state, instanceId, loc);
  const pl = state.players[ownerIndex];
  const slot = findEmptySlot(pl.field.monsters);
  if (slot === -1) return false;
  const card = getCard(require('./deckUtils').cardIdFromInstance(instanceId));
  pl.field.monsters[slot] = {
    instanceId,
    cardId: card._id.toString(),
    position,
    faceDown,
    baseAtk: card.atk || 0,
    baseDef: card.def || 0,
    summonedTurn: state.turnNumber,
    hasAttacked: false,
    equips: [],
    counters: {},
    negated: false,
  };
  return true;
}

function placeSupport(state, instanceId, ownerIndex, { faceDown = false } = {}) {
  const loc = findInstanceLocation(state, instanceId);
  if (loc) removeFromZone(state, instanceId, loc);
  const pl = state.players[ownerIndex];
  const slot = findEmptySlot(pl.field.support);
  if (slot === -1) return false;
  const card = getCard(require('./deckUtils').cardIdFromInstance(instanceId));
  pl.field.support[slot] = {
    instanceId,
    cardId: card._id.toString(),
    faceDown,
    activatedThisTurn: false,
  };
  return true;
}

// Territorio (Reino) has its own single-card zone, separate from the general support zone.
// Rulebook: activating a new one automatically sends the old one to the graveyard — it's a
// replace, not a "zone full" block like the general support zone.
function placeTerritory(state, instanceId, ownerIndex) {
  const loc = findInstanceLocation(state, instanceId);
  if (loc) removeFromZone(state, instanceId, loc);
  const pl = state.players[ownerIndex];
  if (pl.field.territory) {
    pl.graveyard.push(pl.field.territory.instanceId);
    log(state, 'El Territorio anterior es enviado al cementerio.');
  }
  const card = getCard(require('./deckUtils').cardIdFromInstance(instanceId));
  pl.field.territory = { instanceId, cardId: card._id.toString(), faceDown: false };
  return true;
}

module.exports = {
  player,
  opponentIndex,
  findInstanceLocation,
  getFieldMonster,
  getFieldSupport,
  removeFromZone,
  moveToZone,
  placeMonster,
  placeSupport,
  placeTerritory,
  log,
};
