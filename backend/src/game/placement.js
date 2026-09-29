// Where a card an effect brings onto the field lands. Rulebook: the player chooses the zone, not
// the engine. With one free zone there's nothing to choose and it goes there at once; with more,
// the duel waits on a 'slot' choice (clicked on the board, answered through RESOLVE_TRIGGER_CHOICE).
//
// Several placements can queue up (two tokens, every material of a decompiled monster): they are
// asked one at a time, each with the zones still free at that point. What happens once the zone is
// known is kept as plain data (`purpose` + its fields) — the state is cloned and saved, so it can't
// hold a callback — and finished by `finishPlacement`.
const { getCard } = require('./cardIndex');
const { player, log, placeMonster, corrodedSlots, removeFromZone, findInstanceLocation } = require('./zones');
const { cardIdFromInstance } = require('./deckUtils');

const PURPOSES = ['token', 'effectSummon', 'takeControl', 'decompile'];

const isPlacement = (pending) => !!pending && pending.kind === 'slot' && PURPOSES.includes(pending.purpose);

function freeMonsterSlots(state, playerIndex) {
  const pl = player(state, playerIndex);
  const blocked = corrodedSlots(pl, 'monsters');
  return pl.field.monsters.map((m, i) => (m === null && !blocked.includes(i) ? i : -1)).filter((i) => i >= 0);
}

// Queues a placement and settles whatever needs no choice.
//   { purpose, controllerIndex (whose field), sourceInstanceId (the card shown), prompt, ...data }
function requestPlacement(state, placement) {
  state.pendingTriggerChoices = state.pendingTriggerChoices || [];
  state.pendingTriggerChoices.push({ kind: 'slot', zone: 'monster', slots: [], ...placement });
  settlePlacements(state);
}

// While the next choice is a placement with at most one free zone, does it without asking; stops at
// the first real choice, refreshing its zones.
function settlePlacements(state) {
  const queue = state.pendingTriggerChoices || [];
  while (isPlacement(queue[0])) {
    const pending = queue[0];
    const slots = freeMonsterSlots(state, pending.controllerIndex);
    if (slots.length > 1) {
      pending.slots = slots;
      return;
    }
    queue.shift();
    if (slots.length === 1) finishPlacement(state, pending, slots[0]);
    else noRoom(state, pending);
  }
}

function tokenEntry(state, tokenDef) {
  return {
    instanceId: `token:${tokenDef.name}:${Date.now()}:${Math.random().toString(36).slice(2, 6)}`,
    cardId: null,
    isToken: true,
    tokenDef,
    position: 'attack',
    faceDown: false,
    baseAtk: tokenDef.atk || 0,
    baseDef: tokenDef.def || 0,
    summonedTurn: state.turnNumber,
    hasAttacked: false,
    attacksThisTurn: 0,
    equips: [],
    counters: {},
  };
}

const nameOf = (instanceId) => getCard(cardIdFromInstance(instanceId)).name;

// Puts the card in `slot` and does what comes with it.
function finishPlacement(state, pending, slot) {
  const pl = player(state, pending.controllerIndex);
  switch (pending.purpose) {
    case 'token': {
      pl.field.monsters[slot] = tokenEntry(state, pending.tokenDef);
      log(state, `${pl.userId} invoca la ficha ${pending.tokenDef.name}.`);
      return true;
    }
    case 'effectSummon': {
      if (!placeMonster(state, pending.instanceId, pending.controllerIndex, { position: pending.position || 'attack', slot })) return false;
      const card = getCard(cardIdFromInstance(pending.instanceId));
      log(state, `${pl.userId} invoca a ${card.name} por un efecto.`);
      require('./summon').announceSummon(state, pending.controllerIndex, pending.instanceId, card, false, {
        byEffect: true,
        bySourceInstanceId: pending.bySourceInstanceId || null,
        bySourceCardId: pending.bySourceInstanceId ? cardIdFromInstance(pending.bySourceInstanceId) : null,
      });
      return true;
    }
    case 'takeControl': {
      const loc = findInstanceLocation(state, pending.instanceId);
      if (!loc || loc.zone !== 'field:monster' || pl.field.monsters[slot] !== null) return false;
      const opp = player(state, loc.ownerIndex);
      const chosen = opp.field.monsters[loc.slot];
      // Through removeFromZone, so any Equipo cards on it are released (they don't follow it).
      removeFromZone(state, pending.instanceId, loc);
      chosen.attackLockTurn = state.turnNumber;
      if (pending.changeBreed) chosen.breedOverride = pending.changeBreed;
      pl.field.monsters[slot] = chosen;
      log(state, `${pl.userId} toma el control de ${nameOf(pending.instanceId)}.`);
      if (pending.destroyOthers) {
        const { sendToGraveyard } = require('./effects/fieldActions');
        const ctx = { state, controllerIndex: pending.controllerIndex, sourceInstanceId: pending.sourceInstanceId };
        opp.field.monsters.filter(Boolean).forEach((m) => sendToGraveyard(ctx, { entry: m, ownerIndex: loc.ownerIndex }));
      }
      return true;
    }
    case 'decompile': {
      if (!placeMonster(state, pending.instanceId, pending.controllerIndex, { position: 'attack', slot })) return false;
      const back = pl.field.monsters[slot];
      back.attackLockTurn = state.turnNumber; // decompiling happens as the Battle Phase ends
      require('./summon').announceSummon(state, pending.controllerIndex, pending.instanceId, getCard(cardIdFromInstance(pending.instanceId)));
      return true;
    }
    default:
      return false;
  }
}

// No zone left when its turn came (earlier placements filled them).
function noRoom(state, pending) {
  if (pending.purpose === 'token') log(state, `No hay espacio para la ficha ${pending.tokenDef.name}.`);
  else if (pending.purpose === 'decompile') {
    require('./zones').moveToZone(state, pending.instanceId, 'graveyard');
    log(state, `${nameOf(pending.instanceId)} no cabe en el Campo: va al Cementerio.`);
  } else log(state, 'No hay espacio en el Campo.');
}

module.exports = { requestPlacement, settlePlacements, finishPlacement, freeMonsterSlots, isPlacement };
