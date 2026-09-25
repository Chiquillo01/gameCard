const { getCard } = require('./cardIndex');
const { clearStatus, BURN } = require('./statuses');

function player(state, idx) {
  return state.players[idx];
}

function opponentIndex(idx) {
  return idx === 0 ? 1 : 0;
}

// Who a card instance belongs to, read from its id (`<ownerIndex>:<cardId>:<n>`) — not the same
// as who controls it right now (a monster taken with takeControl, a monster equipped to a rival's
// Carnívora). Tokens (`token:...`) have no owner outside the field: null.
function ownerOfInstance(instanceId) {
  const owner = Number(String(instanceId).split(':')[0]);
  return owner === 0 || owner === 1 ? owner : null;
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
  else if (loc.zone === 'field:monster') {
    pl.field.monsters[loc.slot] = null;
    releaseEquipment(state, instanceId);
  } else if (loc.zone === 'field:support') pl.field.support[loc.slot] = null;
  else if (loc.zone === 'field:territory') pl.field.territory = null;
  // A card that leaves the field comes back (if it ever does) as a new card: whatever negated it
  // while it was there doesn't follow it.
  if (loc.zone.startsWith('field:')) require('./negation').clearNegations(state, instanceId);
}

// Rulebook, Cartas de Equipo: "Si el monstruo equipado es destruido, volteado boca abajo o
// retirado del juego, su o sus Cartas de Equipo son enviadas al cementerio." Covers every way a
// monster leaves its field slot; a flip to face-down (which stays in the same slot) is released
// separately, at the one place that does that (effects/actions.js's changePosition). Each card goes
// to its owner's Cementerio — a monster equipped as an Equipo (Carnívora) may belong to the rival.
function releaseEquipment(state, instanceId) {
  state.players.forEach((pl) => {
    pl.field.support
      .filter((s) => s && s.equippedTo === instanceId)
      .forEach((s) => moveToZone(state, s.instanceId, 'graveyard'));
  });
}

// Rulebook, Corrosión: a zone marked as corrosive can't hold cards. `blocked` is the set of slot
// indexes that are currently corroded for this kind of zone.
function findEmptySlot(arr, blocked = []) {
  return arr.findIndex((s, i) => s === null && !blocked.includes(i));
}

function corrodedSlots(pl, zone) {
  return (pl.corrosion || []).filter((c) => c.zone === zone).map((c) => c.slot);
}

// Cards "under" a compiled monster (its materials) leave with it, to the same place — except that
// a compiled monster sent back to the Mazo-C sends its materials to the Mazo.
function releaseMaterials(state, entry, ownerIndex, toZone) {
  if (!entry || !entry.materials || !entry.materials.length) return;
  const dest = toZone === 'extra' ? 'deck' : toZone;
  entry.materials.forEach((id) => moveToZone(state, id, dest, ownerIndex));
  entry.materials = [];
}

function log(state, message) {
  state.log.push({ turn: state.turnNumber, phase: state.phase, message, at: Date.now() });
  if (state.log.length > 300) state.log.shift();
}

// Moves a card instance from wherever it currently is into a simple (non-field) zone. Without an
// explicit owner it goes to its real owner's zone (a stolen monster goes back to its owner's
// Cementerio/Mano), falling back to whoever holds it now for ids that carry no owner.
// `deckPosition: 'shuffle'` inserts it at a random spot ("baraja/regresa al Mazo") instead of on top.
function moveToZone(state, instanceId, toZone, ownerIndexOverride, { deckPosition = 'top' } = {}) {
  const loc = findInstanceLocation(state, instanceId);
  const ownerIndex = ownerIndexOverride ?? ownerOfInstance(instanceId) ?? (loc ? loc.ownerIndex : null);
  if (ownerIndex === null) return false;
  const leaving = loc && loc.zone === 'field:monster' ? state.players[loc.ownerIndex].field.monsters[loc.slot] : null;
  if (loc) removeFromZone(state, instanceId, loc);
  const pl = state.players[ownerIndex];
  if (toZone === 'hand') pl.hand.push(instanceId);
  else if (toZone === 'extra') pl.extra.push(instanceId);
  else if (toZone === 'deck') {
    if (deckPosition === 'shuffle') pl.deck.splice(Math.floor(Math.random() * (pl.deck.length + 1)), 0, instanceId);
    else pl.deck.unshift(instanceId);
  } else if (toZone === 'graveyard') {
    pl.graveyard.push(instanceId);
    markSentToGraveyard(state, instanceId);
  } else if (toZone === 'banished') pl.banished.push(instanceId);
  else return false;
  if (leaving) {
    // A burning monster that is destroyed stops burning; other statuses stay with the card.
    clearStatus(state, instanceId, BURN);
    releaseMaterials(state, leaving, ownerIndex, toZone);
    // Rulebook, Aboleth: "al destruir un monstruo Agua en el Campo" — opens its special-summon
    // window for the rest of the turn (see game/summonRules "waterMonsterDestroyed" condition).
    if (toZone === 'graveyard' && !leaving.isToken && getCard(leaving.cardId).attribute === 'Agua') {
      state.specialSummonWindows = state.specialSummonWindows || {};
      state.specialSummonWindows.waterMonsterDestroyed = state.turnNumber;
    }
  }
  return true;
}

// Remembers the turn each card last reached the Cementerio ("excepto el turno que fue enviada al
// Cementerio" — Refuerzos, Loto de Obsidiana).
function markSentToGraveyard(state, instanceId) {
  state.graveyardTurn = state.graveyardTurn || {};
  state.graveyardTurn[instanceId] = state.turnNumber;
}

// Resolves which slot a card lands in: the player's own pick if they gave one (validated against
// the zone's actual free slots), otherwise the first free slot — same fallback every automatic
// placement (a token, a triggered special summon, the bot) already relied on before slots became
// player-choosable.
function resolveSlot(arr, blocked, slot) {
  if (slot === null || slot === undefined) return findEmptySlot(arr, blocked);
  return slot >= 0 && slot < arr.length && arr[slot] === null && !blocked.includes(slot) ? slot : -1;
}

// Puts a card instance onto the field as a monster. `slot` (0-based) is the player's own pick —
// Rulebook: the player chooses where on the board a card lands, not the engine.
function placeMonster(state, instanceId, ownerIndex, { position = 'attack', faceDown = false, slot = null } = {}) {
  const pl = state.players[ownerIndex];
  // Resolved — and refused, on an occupied/corroded/out-of-range pick — before touching the
  // card's current zone, so a rejected placement leaves it exactly where it was.
  const targetSlot = resolveSlot(pl.field.monsters, corrodedSlots(pl, 'monsters'), slot);
  if (targetSlot === -1) return false;
  const loc = findInstanceLocation(state, instanceId);
  if (loc) removeFromZone(state, instanceId, loc);
  const card = getCard(require('./deckUtils').cardIdFromInstance(instanceId));
  pl.field.monsters[targetSlot] = {
    instanceId,
    cardId: card._id.toString(),
    position,
    faceDown,
    baseAtk: card.atk || 0,
    baseDef: card.def || 0,
    summonedTurn: state.turnNumber,
    hasAttacked: false,
    attacksThisTurn: 0,
    equips: [],
    counters: {},
  };
  return true;
}

// Returns the created field entry (truthy), or null if the chosen/first free support slot isn't
// available. `slot` (0-based) is the player's own pick.
function placeSupport(state, instanceId, ownerIndex, { faceDown = false, slot = null } = {}) {
  const pl = state.players[ownerIndex];
  // Resolved — and refused, on an occupied/corroded/out-of-range pick — before touching the
  // card's current zone, so a rejected placement leaves it exactly where it was.
  const targetSlot = resolveSlot(pl.field.support, corrodedSlots(pl, 'support'), slot);
  if (targetSlot === -1) return null;
  const loc = findInstanceLocation(state, instanceId);
  if (loc) removeFromZone(state, instanceId, loc);
  const card = getCard(require('./deckUtils').cardIdFromInstance(instanceId));
  const entry = {
    instanceId,
    cardId: card._id.toString(),
    faceDown,
    activatedThisTurn: false,
  };
  pl.field.support[targetSlot] = entry;
  return entry;
}

// Territorio (Reino) has its own single-card zone, separate from the general support zone.
// Rulebook: activating a new one automatically sends the old one to the graveyard — it's a
// replace, not a "zone full" block like the general support zone.
function placeTerritory(state, instanceId, ownerIndex) {
  const loc = findInstanceLocation(state, instanceId);
  if (loc) removeFromZone(state, instanceId, loc);
  const pl = state.players[ownerIndex];
  if (pl.field.territory) {
    const old = pl.field.territory.instanceId;
    pl.field.territory = null;
    moveToZone(state, old, 'graveyard');
    log(state, 'El Territorio anterior es enviado al cementerio.');
  }
  const card = getCard(require('./deckUtils').cardIdFromInstance(instanceId));
  pl.field.territory = { instanceId, cardId: card._id.toString(), faceDown: false };
  return true;
}

module.exports = {
  player,
  opponentIndex,
  ownerOfInstance,
  findInstanceLocation,
  getFieldMonster,
  getFieldSupport,
  removeFromZone,
  moveToZone,
  releaseMaterials,
  releaseEquipment,
  findEmptySlot,
  corrodedSlots,
  placeMonster,
  placeSupport,
  placeTerritory,
  log,
};
