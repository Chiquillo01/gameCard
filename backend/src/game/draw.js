// Drawing cards — the turn's own draw and every card effect that says "roba" go through here, so
// both lose the duel on an empty Mazo the same way and both count for Anillo de Boda ("Si tu
// oponente roba una carta, tú también lo harás").
const { player, opponentIndex, log } = require('./zones');
const { declareLoss } = require('./outcome');

// `fromEffect`: a card-effect draw ("añadida a tu Mano desde el Mazo" for Avispa Mutante) — the
// turn's own draw isn't. `mirrored`: this draw is itself an Anillo de Boda copy, so it doesn't
// bounce back.
function drawCards(state, playerIndex, amount = 1, { fromEffect = false, mirrored = false } = {}) {
  const pl = player(state, playerIndex);
  const drawn = [];
  for (let i = 0; i < amount; i++) {
    if (!pl.deck.length) {
      declareLoss(state, playerIndex, `${pl.userId} no puede robar y pierde la partida.`);
      break;
    }
    drawn.push(pl.deck.shift());
  }
  drawn.forEach((id) => pl.hand.push(id));
  if (drawn.length) log(state, `${pl.userId} roba ${drawn.length} carta(s).`);
  if (fromEffect) {
    const { fireHandTrigger } = require('./summon');
    drawn.forEach((id) => fireHandTrigger(state, 'addedToHand', id, playerIndex));
  }
  if (!mirrored && drawn.length) runMirrors(state, 'draw', playerIndex, drawn.length);
  return drawn;
}

// Anillo de Boda / Viaje de Unión: "para el resto del turno, si tu oponente <event>, tú también".
// `actorIndex` is who just did it; every mirror owned by their opponent copies it.
function runMirrors(state, event, actorIndex, amount) {
  (state.mirrors || [])
    .filter((m) => m.event === event && m.ownerIndex === opponentIndex(actorIndex) && m.expiresTurn >= state.turnNumber)
    .forEach((m) => {
      if (event === 'draw' || event === 'search') drawCards(state, m.ownerIndex, event === 'search' ? 1 : amount, { fromEffect: true, mirrored: true });
      if (event === 'gainVP') {
        const pl = player(state, m.ownerIndex);
        pl.vp += amount;
        log(state, `${pl.userId} también gana ${amount} VP (VP: ${pl.vp}).`);
      }
    });
}

function expireMirrors(state) {
  if (state.mirrors) state.mirrors = state.mirrors.filter((m) => m.expiresTurn > state.turnNumber);
}

module.exports = { drawCards, runMirrors, expireMirrors };
