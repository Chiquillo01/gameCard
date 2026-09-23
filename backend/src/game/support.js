const { getCard, getEffect } = require('./cardIndex');
const { player, opponentIndex, placeSupport, placeTerritory, moveToZone, log } = require('./zones');
const { payCost, pendingCostChoice } = require('./effects/costs');
const { checkConditions } = require('./effects/conditions');
const { checkWin } = require('./effects/actions');
const { pendingSearchChoice } = require('./effects/fieldActions');
const { matchesFilter } = require('./filters');
const { speedOf, canAddLink, addLink } = require('./chain');
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
function activateSupport(state, controllerIndex, instanceId, { targets = [], setFaceDown = false, slot = null } = {}) {
  const pl = player(state, controllerIndex);
  if (!pl.hand.includes(instanceId)) return { ok: false, reason: 'not-in-hand' };

  const cardId = cardIdFromInstance(instanceId);
  const card = getCard(cardId);
  if (card.category !== 'support') return { ok: false, reason: 'not-support' };

  if (setFaceDown) {
    if (card.subtype === 'field') return { ok: false, reason: 'cannot-set-territory' };
    // Rulebook: the player chooses where on the board the card lands, not the engine.
    const placed = placeSupport(state, instanceId, controllerIndex, { faceDown: true, slot });
    if (!placed) return { ok: false, reason: 'no-field-space' };
    log(state, `${pl.userId} coloca boca abajo un apoyo.`);
    return { ok: true };
  }

  return resolveActivation(state, controllerIndex, instanceId, card, targets, null, slot);
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

function resolveActivation(state, controllerIndex, instanceId, card, targets, setEntry = null, slot = null) {
  const pl = player(state, controllerIndex);
  const ctx = { state, controllerIndex, sourceInstanceId: instanceId };

  // Rulebook, Cartas de Equipo: an Equipo card always names the monster it goes on when you
  // activate it — there's no "activate it plain" the way a Normal/Continuo card works.
  if (card.subtype === 'equipment') {
    const candidates = legalEquipTargets(state, controllerIndex, card);
    if (!targets.length) {
      if (!candidates.length) return { ok: false, reason: 'no-legal-equip-target' };
      return { ok: false, reason: 'choose-target', options: candidates.map(describeFieldTarget) };
    }
    if (!candidates.some((m) => m.instanceId === targets[0])) return { ok: false, reason: 'invalid-equip-target' };
  }

  // Rulebook, Velocidades/Apilar: this activation has to be legal speed-wise before it can even
  // be placed on the Pila — Normal/Continuo/Equipo/Tierra (Speed 1) can never respond to
  // something already on it.
  const speed = speedOf(card);
  if (!canAddLink(state, controllerIndex, speed)) return { ok: false, reason: 'too-slow' };

  // Effects that will actually run right now (their zone/conditions already satisfied) — used
  // for both the search-choice check below and, once the player has chosen, to pay their costs
  // and resolve their actions, so all three agree on exactly the same set.
  const runningEffects = effectsToResolve(ctx, card);

  // A search action (e.g. Enjambre de Avispas' "añade un monstruo Avispa de tu Mazo") is the
  // player's pick, not automatic — with more than one legal match and nothing chosen, ask instead
  // of silently grabbing whichever the deck happens to put first.
  const searchOptions = runningEffects.map((effect) => pendingSearchChoice(state, controllerIndex, effect, targets)).find(Boolean);
  if (searchOptions) return { ok: false, reason: 'choose-target', options: searchOptions };

  // Rulebook: a cost never picks for the player (see costs.js pendingCostChoice) — with more
  // legal payers than the cost needs and nothing chosen yet, ask instead of silently taking one.
  const cost = card.activationCost;
  const costChoice = (cost && pendingCostChoice(ctx, cost, targets))
    || runningEffects.map((effect) => effect.cost && pendingCostChoice({ ...ctx, effect }, effect.cost, targets)).find(Boolean);
  if (costChoice) return { ok: false, reason: 'choose-target', options: costChoice };

  const before = { pixelcoins: pl.pixelcoins, vp: pl.vp };
  if (cost && cost.fn) {
    const paid = payCost(ctx, cost, targets);
    if (!paid) return { ok: false, reason: 'cannot-pay-cost' };
  }
  // Some cards add a cost inside their effect ("destruye un monstruo en tu Campo:"): pay it now, and
  // hand back the activation cost if it can't be paid.
  if (!payEffectCosts(ctx, runningEffects, targets)) {
    pl.pixelcoins = before.pixelcoins;
    pl.vp = before.vp;
    return { ok: false, reason: 'cannot-pay-cost' };
  }

  // Rulebook: activating ANY Apoyo card places it on the Campo right away — that's the cost of
  // activating it, not the effect — Normal/Veloz/Contraataque included, which is what actually
  // opens the response window for them instead of resolving straight to the Cementerio.
  let entry = setEntry;
  if (card.subtype === 'field') {
    placeTerritory(state, instanceId, controllerIndex);
  } else {
    if (entry) {
      entry.faceDown = false; // already in its zone: just turn it over
    } else {
      // Rulebook: the player chooses where on the board the card lands, not the engine.
      entry = placeSupport(state, instanceId, controllerIndex, { faceDown: false, slot });
      if (!entry) return { ok: false, reason: 'no-field-space' };
    }
    if (card.subtype === 'equipment') entry.equippedTo = targets[0];
  }
  const removedFromHand = pl.hand.includes(instanceId);
  if (removedFromHand) pl.hand = pl.hand.filter((id) => id !== instanceId);
  log(state, `${pl.userId} coloca ${card.name} en el Campo.`);

  if (!runningEffects.length) {
    // Nothing to resolve (a pure Continuo buff, say) — nothing goes on the Pila.
    recomputeContinuous(state);
    checkWin(state);
    return { ok: true };
  }

  const oneShot = card.subtype === 'normal' || card.subtype === 'instant' || card.subtype === 'counter';
  addLink(state, { controllerIndex, sourceInstanceId: instanceId, cardName: card.name, effects: runningEffects, targets, speed, afterResolve: oneShot ? 'graveyard' : null });
  return { ok: true };
}

// Which face-up field monsters an Equipo card can legally be equipped to right now: its own side
// unless the effect's whileEquipped trigger says `side: "opponent"` (Fuegos Fatuos), narrowed by
// whatever breed/family/attribute restriction that trigger's args carry (e.g. "Solo se puede ser
// equipada a un monstruo Insecto") — read from the data, not parsed out of the card's text.
function legalEquipTargets(state, controllerIndex, card) {
  const equipEffect = (card.effectCodes || []).map(getEffect).find((e) => e && e.trigger && e.trigger.fn === 'whileEquipped');
  const restriction = (equipEffect && equipEffect.trigger.args) || {};
  const side = restriction.side === 'opponent' ? opponentIndex(controllerIndex) : controllerIndex;
  const filter = { breed: restriction.breed, family: restriction.family, attribute: restriction.attribute };
  return player(state, side).field.monsters.filter((m) => m && !m.faceDown && matchesFilter(m, filter));
}

function describeFieldTarget(m) {
  if (m.isToken) return { instanceId: m.instanceId, name: m.tokenDef.name, image: null };
  const card = getCard(m.cardId);
  return { instanceId: m.instanceId, cardId: card._id.toString(), name: card.name, image: card.image };
}

// Resolves a support card's own on-play effect(s) — called right as the card is activated from
// hand. A card can also grant a SEPARATE effect meant to be activated later, once it's actually
// sitting in the graveyard/exile/back on the field (e.g. Enjambre de Avispas' graveyard ability)
// — those are only reachable through a later, explicit ACTIVATE_EFFECT, never fired here.
// Only these effect types resolve at the moment a support is played; a "triggered" one (Nido de
// Avispas) waits for its event and a "continuous" one is recomputed from the board.
const ON_PLAY_EFFECT_TYPES = ['activated', 'quick', 'ignition'];

function effectsToResolve(ctx, card) {
  return (card.effectCodes || [])
    .map((effectId) => getEffect(effectId))
    .filter((effect) => effect && ON_PLAY_EFFECT_TYPES.includes(effect.type))
    .filter((effect) => !['graveyard', 'banished', 'field'].includes(requiredZoneFor(effect)))
    .filter((effect) => checkConditions({ ...ctx, effect }, effect.conditions));
}

// The effect-level costs of the effects that resolve as the card is played.
function payEffectCosts(ctx, effects, targets) {
  return effects.every((effect) => !effect.cost || payCost({ ...ctx, effect }, effect.cost, targets));
}

module.exports = { activateSupport, activateSetSupport };
