// How a duel ends, in one place, so "Tú no puedes perder y tu oponente no puede ganar" (Ángel de
// Platino — the `cantLose`/`cantWin` flags recomputeContinuous keeps on each player) applies to every
// way of losing: 0 VP, running out of cards, or a card that wins outright (Gigante Elemental).
const { log } = require('./zones');

const other = (idx) => (idx === 0 ? 1 : 0);

// `message` says why it ended; it goes to the log and stays on the state (`endReason`) so the
// end-of-duel screen can say it too.
function declareLoss(state, loserIndex, message) {
  if (state.status !== 'active' || state.winnerIndex !== null) return false;
  const loser = state.players[loserIndex];
  const winner = state.players[other(loserIndex)];
  if (loser.cantLose || winner.cantWin) return false;
  state.winnerIndex = other(loserIndex);
  state.status = 'finished';
  state.endReason = message;
  log(state, message);
  return true;
}

function declareWin(state, winnerIndex, message) {
  return declareLoss(state, other(winnerIndex), message);
}

function checkWin(state) {
  if (state.winnerIndex !== null) return;
  // The rulebook's "triple your rival's VP" win was dropped (balance pass): a duel is won by
  // taking the rival to 0 VP.
  state.players.forEach((p, i) => {
    if (state.winnerIndex !== null) return;
    if (p.vp <= 0) declareLoss(state, i, `${p.userId} se queda sin VP y pierde la partida.`);
  });
}

// Surrendering ends it at once (it isn't stopped by "no puedes perder").
function surrender(state, playerIndex) {
  state.winnerIndex = other(playerIndex);
  state.status = 'finished';
  state.endReason = `${state.players[playerIndex].userId} se rinde.`;
  log(state, state.endReason);
}

module.exports = { declareLoss, declareWin, checkWin, surrender };
