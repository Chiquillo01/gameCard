const { PHASES } = require('./constants');
const { rules } = require('./rules');
const { player, opponentIndex, log, placeMonster, moveToZone } = require('./zones');
const { getCard } = require('./cardIndex');
const { cardIdFromInstance } = require('./deckUtils');
const { fireTrigger, recomputeContinuous, expireTimedBuffs } = require('./effectEngine');
const { checkWin } = require('./outcome');
const { burningMonsters, expireStatuses } = require('./statuses');
const { expireNegations } = require('./negation');
const { drawCards, expireMirrors } = require('./draw');

function advancePhase(state) {
  if (state.status !== 'active') return { ok: false, reason: 'match-finished' };

  const idx = PHASES.indexOf(state.phase);
  if (idx === PHASES.length - 1) {
    // The Reinos' upkeep is the very last thing of the turn: each player answers, then it ends.
    if (askTerritoryUpkeep(state)) return { ok: true, upkeep: true };
    endTurn(state);
    return { ok: true, newTurn: true };
  }

  // "Al final de la fase de batalla" (the Licanos going back to the Mazo) happens while it's
  // still the Battle Phase, right before it's left.
  if (state.phase === 'battle') fireTrigger(state, 'phase', { timing: 'endOfBattlePhase' });

  let nextPhase = PHASES[idx + 1];
  // Rulebook: the player who goes first cannot carry out a Battle Phase on their very first
  // turn — and with no Battle Phase, there's no Principal 2 either, so play goes straight to end.
  if (nextPhase === 'battle' && state.firstTurn && state.turnNumber === 1) {
    nextPhase = 'end';
  }

  state.phase = nextPhase;
  runPhaseEntry(state);
  return { ok: true };
}

function runPhaseEntry(state) {
  const pl = player(state, state.turnPlayer);

  if (state.phase === 'draw') {
    // Each player's own first turn has no draw (not only the turn that opens the duel).
    if (pl.turnsPlayed > 0) {
      drawCards(state, state.turnPlayer, 1);
      if (state.status !== 'active') return;
    }

    // Rulebook: PIXEL_INCOME_PER_TURN pixels/turn automatically, capped at PIXEL_CAP — except a player's own first turn.
    const isPlayersFirstTurn = pl.turnsPlayed === 0;
    if (!isPlayersFirstTurn) {
      const before = pl.pixelcoins;
      pl.pixelcoins = Math.min(rules().pixelCap, pl.pixelcoins + rules().pixelIncomePerTurn);
      if (pl.pixelcoins !== before) log(state, `${pl.userId} gana píxeles (total: ${pl.pixelcoins}).`);
    }
    pl.turnsPlayed += 1;
  }

  if (state.phase === 'standby') {
    returnExiledAtStandby(state);
    fireTrigger(state, 'phase', { timing: 'standbyPhase' });
  }

  if (state.phase === 'main1' || state.phase === 'main2') {
    fireTrigger(state, 'phase', { timing: 'mainPhase' });
  }

  if (state.phase === 'end') {
    fireTrigger(state, 'phase', { timing: 'endPhase' });
    returnExiled(state);
    applyBurnDamage(state);
    // Book contradicts itself on the exact number and destination (7-to-exile vs 8-to-graveyard
    // in different sections) — using the more detailed rule: discard to MAX_HAND_SIZE, to the
    // graveyard. The player picks which cards go (Rulebook: a discard is never random unless the
    // card says so) — the turn can't end until they have.
    const maxHand = rules().maxHandSize;
    const excess = pl.hand.length - maxHand;
    if (excess > 0) {
      require('./effects/actions').requestDiscard(state, state.turnPlayer, excess, `Tienes más de ${maxHand} cartas: elige ${excess} para descartar`);
    }
  }

  recomputeContinuous(state);
  checkWin(state);
}

// Monsters exiled "hasta la Fase Final" come back to their owner's field now (bringBack).
function returnExiled(state) {
  const all = state.returnAtEndPhase || [];
  // "Hasta el final del siguiente turno" waits for that turn's Fase Final.
  const due = all.filter((r) => (r.returnTurn ?? state.turnNumber) <= state.turnNumber);
  state.returnAtEndPhase = all.filter((r) => !due.includes(r));
  bringBack(state, due);
}

// Monsters exiled "hasta tu próxima Fase de Espera" (Araña de Fase) come back in their owner's.
function returnExiledAtStandby(state) {
  const all = state.returnAtStandby || [];
  const due = all.filter((r) => r.ownerIndex === state.turnPlayer);
  state.returnAtStandby = all.filter((r) => !due.includes(r));
  bringBack(state, due);
}

// Back in the position they left in. With no free zone they go to the Cementerio instead; one that
// already left the Exilio some other way stays wherever it is.
function bringBack(state, due) {
  due.forEach(({ instanceId, ownerIndex, position }) => {
    const owner = player(state, ownerIndex);
    if (!owner.banished.includes(instanceId)) return;
    const name = getCard(cardIdFromInstance(instanceId)).name;
    if (placeMonster(state, instanceId, ownerIndex, { position: position || 'attack' })) {
      log(state, `${name} vuelve del Exilio al Campo.`);
    } else {
      moveToZone(state, instanceId, 'graveyard');
      log(state, `${name} no cabe en el Campo al volver del Exilio: va al Cementerio.`);
    }
  });
}

// Rulebook: "Si existen dos Territorios en juego ambos jugadores tendrán que pagar 1 pixel al
// final de cada turno para mantener activo su Territorio." It's the last window of the turn (no
// Pila can be opened in it): each player — the turn player first — chooses to pay 1 píxel and keep
// their Reino, or to send it to the Cementerio (the only option with no píxel left). The turn ends
// once both have answered (effectEngine.resolveTriggerChoice → resolveTerritoryUpkeep).
function askTerritoryUpkeep(state) {
  if (state.upkeepTurn === state.turnNumber) return false;
  if (!state.players.every((p) => p.field.territory)) return false;
  state.upkeepTurn = state.turnNumber;
  state.pendingTriggerChoices = state.pendingTriggerChoices || [];
  [state.turnPlayer, opponentIndex(state.turnPlayer)].forEach((i) => {
    const p = player(state, i);
    const card = getCard(p.field.territory.cardId);
    const options = [];
    if (p.pixelcoins >= 1) options.push({ instanceId: 'upkeep:pay', name: `Mantener ${card.name} (pagar 1 Píxel)`, image: card.image });
    options.push({ instanceId: 'upkeep:drop', name: `Enviar ${card.name} al Cementerio`, image: null });
    state.pendingTriggerChoices.push({ kind: 'upkeep', controllerIndex: i, options, prompt: `Mantenimiento de los Reinos: ¿pagas 1 Píxel para mantener ${card.name}?` });
  });
  log(state, 'Hay dos Reinos en juego: cada jugador decide si paga 1 píxel para mantener el suyo.');
  return true;
}

// One player's answer; with nobody left to answer, the turn ends.
function resolveTerritoryUpkeep(state, pending, pick) {
  const p = player(state, pending.controllerIndex);
  const territory = p.field.territory;
  if (territory && pick === 'upkeep:pay' && p.pixelcoins >= 1) {
    p.pixelcoins -= 1;
    log(state, `${p.userId} paga 1 píxel para mantener ${getCard(territory.cardId).name}.`);
  } else if (territory) {
    moveToZone(state, territory.instanceId, 'graveyard');
    log(state, `${p.userId} no mantiene ${getCard(territory.cardId).name}: va al Cementerio.`);
    require('./effectEngine').announceSentToGraveyard(state, territory.instanceId, pending.controllerIndex, { from: 'field', reason: 'effect' });
    // With one Reino gone there are no longer two in play: the other player pays nothing.
    state.pendingTriggerChoices = (state.pendingTriggerChoices || []).filter((q) => q.kind !== 'upkeep');
  }
  if (!(state.pendingTriggerChoices || []).some((q) => q.kind === 'upkeep') && state.status === 'active') endTurn(state);
}

// Rulebook, Quemadura: at the end of every turn each player loses 5 VP per burning monster they control.
function applyBurnDamage(state) {
  state.players.forEach((p, i) => {
    const burning = burningMonsters(state, i).length;
    if (!burning) return;
    const burnDamage = burning * rules().burnEndOfTurnDamage;
    p.vp = Math.max(0, p.vp - burnDamage);
    log(state, `${p.userId} recibe ${burnDamage} de daño por quemadura (VP: ${p.vp}).`);
  });
}

function endTurn(state) {
  expireStatuses(state);
  expireTimedBuffs(state);
  expireNegations(state);
  expireMirrors(state);
  // Paseo Temporal: "Añade otro turno después de este" — the same player goes again.
  const current = state.turnPlayer;
  state.extraTurns = state.extraTurns || {};
  if (state.extraTurns[current] > 0) {
    state.extraTurns[current] -= 1;
    log(state, `${player(state, current).userId} juega un turno extra.`);
  } else {
    state.turnPlayer = opponentIndex(current);
  }
  state.turnNumber += 1;
  state.firstTurn = false;
  state.phase = 'draw';
  const pl = player(state, state.turnPlayer);
  pl.normalSummonUsed = false;
  state.players.forEach((p) => p.field.monsters.filter(Boolean).forEach((m) => { m.attacksThisTurn = 0; }));
  runPhaseEntry(state);
}

module.exports = { advancePhase, endTurn, runPhaseEntry, resolveTerritoryUpkeep };
