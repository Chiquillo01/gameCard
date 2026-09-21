const { getCard, getEffect } = require('./cardIndex');
const { player, placeSupport, placeTerritory, moveToZone, log } = require('./zones');
const { payCost } = require('./effects/costs');
const { checkConditions } = require('./effects/conditions');
const { runAction, checkWin } = require('./effects/actions');
const { recomputeContinuous, requiredZoneFor } = require('./effectEngine');
const { cardIdFromInstance } = require('./deckUtils');

// Rulebook: any Apoyo card can be placed in the support zone face-down or face-up, except the
// Territorio (its own zone). A card set face-down is activated later with activateSetSupport.
//
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

  if (setFaceDown) {
    if (card.subtype === 'field') return { ok: false, reason: 'cannot-set-territory' };
    const placed = placeSupport(state, instanceId, controllerIndex, { faceDown: true });
    if (!placed) return { ok: false, reason: 'no-field-space' };
    log(state, `${pl.userId} coloca boca abajo un apoyo.`);
    return { ok: true };
  }

  return resolveActivation(state, controllerIndex, instanceId, card, targets);
}

// Activates a support that was set face-down in the support zone: turn it face-up, pay its
// activation cost and resolve it like any other activation. Veloz/Contraataque cards are activated
// through their own effects (ACTIVATE_EFFECT) so they are left to that path.
function activateSetSupport(state, controllerIndex, instanceId, { targets = [] } = {}) {
  if (state.phase !== 'main1' && state.phase !== 'main2') return { ok: false, reason: 'not-main-phase' };
  const pl = player(state, controllerIndex);
  const entry = pl.field.support.find((s) => s && s.instanceId === instanceId);
  if (!entry || !entry.faceDown) return { ok: false, reason: 'not-set-support' };
  const card = getCard(entry.cardId);
  if (card.subtype === 'instant' || card.subtype === 'counter') return { ok: false, reason: 'use-its-effect' };
  return resolveActivation(state, controllerIndex, instanceId, card, targets, entry);
}

function resolveActivation(state, controllerIndex, instanceId, card, targets, setEntry = null) {
  const pl = player(state, controllerIndex);
  const ctx = { state, controllerIndex, sourceInstanceId: instanceId };
  const before = { pixelcoins: pl.pixelcoins, vp: pl.vp };
  const cost = card.activationCost;
  if (cost && cost.fn) {
    const paid = payCost(ctx, cost, targets);
    if (!paid) return { ok: false, reason: 'cannot-pay-cost' };
  }
  // Some cards add a cost inside their effect ("destruye un monstruo en tu Campo:"): pay it now, and
  // hand back the activation cost if it can't be paid.
  if (!payEffectCosts(ctx, card, targets)) {
    pl.pixelcoins = before.pixelcoins;
    pl.vp = before.vp;
    return { ok: false, reason: 'cannot-pay-cost' };
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
    if (setEntry) {
      setEntry.faceDown = false; // already in its zone: just turn it over
    } else {
      const placed = placeSupport(state, instanceId, controllerIndex, { faceDown: false });
      if (!placed) return { ok: false, reason: 'no-field-space' };
    }
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

// Resolves a support card's own on-play effect(s) — called right as the card is activated from
// hand. A card can also grant a SEPARATE effect meant to be activated later, once it's actually
// sitting in the graveyard/exile/back on the field (e.g. Enjambre de Avispas' graveyard ability)
// — those are only reachable through a later, explicit ACTIVATE_EFFECT, never fired here.
// Only these effect types resolve at the moment a support is played; a "triggered" one (Nido de
// Avispas) waits for its event and a "continuous" one is recomputed from the board.
const ON_PLAY_EFFECT_TYPES = ['activated', 'quick', 'ignition'];

// The effect-level costs of the effects that resolve as the card is played.
function payEffectCosts(ctx, card, targets) {
  return (card.effectCodes || []).every((effectId) => {
    const effect = getEffect(effectId);
    if (!effect || !effect.cost || !ON_PLAY_EFFECT_TYPES.includes(effect.type)) return true;
    const requiredZone = requiredZoneFor(effect);
    if (requiredZone === 'graveyard' || requiredZone === 'banished' || requiredZone === 'field') return true;
    if (!checkConditions({ ...ctx, effect }, effect.conditions)) return true;
    return payCost({ ...ctx, effect }, effect.cost, targets);
  });
}

function resolveCardEffects(ctx, card, targets) {
  (card.effectCodes || []).forEach((effectId) => {
    const effect = getEffect(effectId);
    if (!effect || !ON_PLAY_EFFECT_TYPES.includes(effect.type)) return; // triggered/continuous ones act on their own
    const requiredZone = requiredZoneFor(effect);
    if (requiredZone === 'graveyard' || requiredZone === 'banished' || requiredZone === 'field') return;
    if (!checkConditions(ctx, effect.conditions)) return;
    (effect.actions || []).forEach((step) => runAction(ctx, step, targets));
  });
}

module.exports = { activateSupport, activateSetSupport };
