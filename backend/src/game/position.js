const { player, log } = require('./zones');
const { fireTrigger, recomputeContinuous } = require('./effectEngine');

// Rulebook (Fase Principal / Secundaria): a player may change a monster's battle position, and a
// face-down monster is turned face-up ("Rotación", which triggers its "flipped" effects). A
// monster summoned this turn can't change position until the next one.
// Not in the book, added as a guard: each monster can only change position once per turn (else
// it could be flipped back and forth to re-trigger Rotación effects).
function changePosition(state, controllerIndex, instanceId, newPosition) {
  if (state.phase !== 'main1' && state.phase !== 'main2') return { ok: false, reason: 'not-main-phase' };
  if (newPosition !== 'attack' && newPosition !== 'defense') return { ok: false, reason: 'invalid-position' };

  const pl = player(state, controllerIndex);
  const monster = pl.field.monsters.find((m) => m && m.instanceId === instanceId);
  if (!monster) return { ok: false, reason: 'monster-not-found' };
  if (monster.summonedTurn === state.turnNumber) return { ok: false, reason: 'summoned-this-turn' };
  if (monster.positionChangedTurn === state.turnNumber) return { ok: false, reason: 'already-changed-position' };

  const wasFaceDown = monster.faceDown;
  if (!wasFaceDown && monster.position === newPosition) return { ok: false, reason: 'same-position' };

  monster.position = newPosition;
  monster.faceDown = false;
  monster.positionChangedTurn = state.turnNumber;
  log(state, wasFaceDown ? `${pl.userId} voltea un monstruo boca arriba.` : `${pl.userId} cambia la posición de un monstruo.`);

  // Face-up first, so the monster is eligible to fire its own flip effects.
  if (wasFaceDown) fireTrigger(state, 'flipped', { instanceId });
  recomputeContinuous(state);
  return { ok: true, flipped: wasFaceDown };
}

module.exports = { changePosition };
