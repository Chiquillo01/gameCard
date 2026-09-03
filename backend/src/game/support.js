const { getCard, getEffect } = require('./cardIndex');
const { player, placeSupport, placeTerritory, moveToZone, log } = require('./zones');
const { payCost } = require('./effects/costs');
const { checkConditions } = require('./effects/conditions');
const { runAction, checkWin } = require('./effects/actions');
const { recomputeContinuous } = require('./effectEngine');
const { cardIdFromInstance } = require('./deckUtils');

// Per Rulebook.pdf "Tipos de efectos de Apoyos": Normal cards resolve immediately and go to the
// graveyard right after — they are never "set" face-down. Only Veloz (quick-play) and
// Contraataque (counter) cards can be placed face-down in advance and activated later,
// including on the opponent's turn. Continuo/Equipo/Reino stay face-up on the field once
// activated. This single entry point routes a support card to the right behavior for its
// subtype instead of treating every Apoyo card the same way.
function activateSupport(state, controllerIndex, instanceId, { targets = [], setFaceDown = false } = {}) {
  const pl = player(state, controllerIndex);
  if (!pl.hand.includes(instanceId)) return { ok: false, reason: 'not-in-hand' };

  const cardId = cardIdFromInstance(instanceId);
  const card = getCard(cardId);
  if (card.category !== 'support') return { ok: false, reason: 'not-support' };

  const ctx = { state, controllerIndex, sourceInstanceId: instanceId };

  if ((card.subtype === 'instant' || card.subtype === 'counter') && setFaceDown) {
    const placed = placeSupport(state, instanceId, controllerIndex, { faceDown: true });
    if (!placed) return { ok: false, reason: 'no-field-space' };
    log(state, `${pl.userId} coloca boca abajo un apoyo.`);
    return { ok: true };
  }

  const cost = card.activationCost;
  if (cost && cost.fn) {
    const paid = payCost(ctx, cost, targets);
    if (!paid) return { ok: false, reason: 'cannot-pay-cost' };
  }

  if (card.subtype === 'field') {
    placeTerritory(state, instanceId, controllerIndex);
    log(state, `${pl.userId} activa el Territorio ${card.name}.`);
    resolveCardEffects(ctx, card, targets);
    recomputeContinuous(state);
    checkWin(state);
    return { ok: true };
  }

  if (card.subtype === 'continuous' || card.subtype === 'equipment') {
    const placed = placeSupport(state, instanceId, controllerIndex, { faceDown: false });
    if (!placed) return { ok: false, reason: 'no-field-space' };
    log(state, `${pl.userId} activa ${card.name}.`);
    resolveCardEffects(ctx, card, targets);
    recomputeContinuous(state);
    checkWin(state);
    return { ok: true };
  }

  // Normal, Veloz (activated directly instead of set), Contraataque: resolve now, then graveyard.
  const removedFromHand = pl.hand.includes(instanceId);
  if (removedFromHand) pl.hand = pl.hand.filter((id) => id !== instanceId);
  resolveCardEffects(ctx, card, targets);
  moveToZone(state, instanceId, 'graveyard', controllerIndex);
  log(state, `${pl.userId} activa ${card.name} y se envía al cementerio.`);
  recomputeContinuous(state);
  checkWin(state);
  return { ok: true };
}

function resolveCardEffects(ctx, card, targets) {
  (card.effectCodes || []).forEach((effectId) => {
    const effect = getEffect(effectId);
    if (!effect) return;
    if (!checkConditions(ctx, effect.conditions)) return;
    (effect.actions || []).forEach((step) => runAction(ctx, step, targets));
  });
}

module.exports = { activateSupport };
