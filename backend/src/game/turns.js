const { PHASES, MAX_HAND_SIZE, PIXEL_INCOME_PER_TURN, PIXEL_CAP } = require('./constants');
const { player, opponentIndex, log } = require('./zones');
const { fireTrigger, recomputeContinuous, expireTimedBuffs } = require('./effectEngine');
const { checkWin } = require('./outcome');
const { burningMonsters, expireStatuses, BURN_END_OF_TURN_DAMAGE } = require('./statuses');
const { expireNegations } = require('./negation');
const { drawCards, expireMirrors } = require('./draw');

function advancePhase(state) {
  if (state.status !== 'active') return { ok: false, reason: 'match-finished' };

  const idx = PHASES.indexOf(state.phase);
  if (idx === PHASES.length - 1) {
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
    const isVeryFirstTurn = state.firstTurn && state.turnNumber === 1;
    if (!isVeryFirstTurn) {
      drawCards(state, state.turnPlayer, 1);
      if (state.status !== 'active') return;
    }

    // Rulebook: 6 pixels/turn automatically, capped at 12 — except a player's own first turn.
    const isPlayersFirstTurn = pl.turnsPlayed === 0;
    if (!isPlayersFirstTurn) {
      const before = pl.pixelcoins;
      pl.pixelcoins = Math.min(PIXEL_CAP, pl.pixelcoins + PIXEL_INCOME_PER_TURN);
      if (pl.pixelcoins !== before) log(state, `${pl.userId} gana píxeles (total: ${pl.pixelcoins}).`);
    }
    pl.turnsPlayed += 1;
  }

  if (state.phase === 'standby') {
    fireTrigger(state, 'phase', { timing: 'standbyPhase' });
  }

  if (state.phase === 'main1' || state.phase === 'main2') {
    fireTrigger(state, 'phase', { timing: 'mainPhase' });
  }

  if (state.phase === 'end') {
    fireTrigger(state, 'phase', { timing: 'endPhase' });
    payTerritoryUpkeep(state);
    applyBurnDamage(state);
    // Book contradicts itself on the exact number and destination (7-to-exile vs 8-to-graveyard
    // in different sections) — using the more detailed rule: discard to MAX_HAND_SIZE, to the
    // graveyard. The player picks which cards go (Rulebook: a discard is never random unless the
    // card says so) — the turn can't end until they have.
    const excess = pl.hand.length - MAX_HAND_SIZE;
    if (excess > 0) {
      require('./effects/actions').requestDiscard(state, state.turnPlayer, excess, `Tienes más de ${MAX_HAND_SIZE} cartas: elige ${excess} para descartar`);
    }
  }

  recomputeContinuous(state);
  checkWin(state);
}

// Rulebook: "Si existen dos Territorios en juego ambos jugadores tendrán que pagar 1 pixel al
// final de cada turno para mantener activo su Territorio." — only kicks in once BOTH players
// have one active; checked at the end of every turn (not just once per round). The book doesn't
// say what happens if a player can't pay, so this just floors at 0 rather than destroying the
// Territorio — the safer assumption until confirmed otherwise.
function payTerritoryUpkeep(state) {
  const bothHaveTerritory = state.players.every((p) => p.field.territory);
  if (!bothHaveTerritory) return;
  state.players.forEach((p) => {
    const before = p.pixelcoins;
    p.pixelcoins = Math.max(0, p.pixelcoins - 1);
    if (p.pixelcoins !== before) log(state, `${p.userId} paga 1 píxel para mantener su Territorio.`);
    else log(state, `${p.userId} no puede pagar el mantenimiento de su Territorio (0 píxeles).`);
  });
}

// Rulebook, Quemadura: at the end of every turn each player loses 5 VP per burning monster they control.
function applyBurnDamage(state) {
  state.players.forEach((p, i) => {
    const burning = burningMonsters(state, i).length;
    if (!burning) return;
    p.vp = Math.max(0, p.vp - burning * BURN_END_OF_TURN_DAMAGE);
    log(state, `${p.userId} recibe ${burning * BURN_END_OF_TURN_DAMAGE} de daño por quemadura (VP: ${p.vp}).`);
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

module.exports = { advancePhase, endTurn, runPhaseEntry };
