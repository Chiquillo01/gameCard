const { getCard, getEffect } = require('./cardIndex');
const { player, opponentIndex, placeSupport, placeTerritory, log, corrodedSlots } = require('./zones');
const { payCost, pendingCostChoice, costPicks } = require('./effects/costs');
const { checkConditions } = require('./effects/conditions');
const { checkWin } = require('./outcome');
const { matchesFilter } = require('./filters');
const { speedOf, linkBlockReason, addLink, responseWindowOpen, isResponseEffect } = require('./chain');
const { recomputeContinuous, requiredZoneFor, violatesUnique } = require('./effectEngine');
const { pendingEffectChoice } = require('./targets');
const { cardIdFromInstance } = require('./deckUtils');
const { snapshot, restore } = require('./stateSnapshot');

// Rulebook: any Apoyo card can be placed in the support zone face-down or face-up, except the
// Territorio (its own zone). A card set face-down is activated later with activateSetSupport.
//
// Per Rulebook.pdf "Tipos de efectos de Apoyos": Normal cards resolve immediately and go to the
// graveyard right after. Veloz (quick-play) and Contraataque (counter) cards can be placed
// face-down in advance and activated later, including on the opponent's turn. Continuo/Equipo/Reino
// stay face-up on the field once activated. This single entry point routes a support card to the
// right behavior for its subtype instead of treating every Apoyo card the same way.
function activateSupport(state, controllerIndex, instanceId, { targets = [], setFaceDown = false, slot = null } = {}) {
  const pl = player(state, controllerIndex);
  if (!pl.hand.includes(instanceId)) return { ok: false, reason: 'not-in-hand' };

  const cardId = cardIdFromInstance(instanceId);
  const card = getCard(cardId);
  if (card.category !== 'support') return { ok: false, reason: 'not-support' };

  if (setFaceDown) {
    if (card.subtype === 'field') return { ok: false, reason: 'cannot-set-territory' };
    // Setting a card isn't activating it, but it's still a Fase Principal action of your own turn.
    if (state.turnPlayer !== controllerIndex || state.chain.length) return { ok: false, reason: 'not-your-turn' };
    if (state.phase !== 'main1' && state.phase !== 'main2') return { ok: false, reason: 'not-main-phase' };
    // Rulebook: the player chooses where on the board the card lands, not the engine.
    const placed = placeSupport(state, instanceId, controllerIndex, { faceDown: true, slot });
    if (!placed) return { ok: false, reason: 'no-field-space' };
    placed.setTurn = state.turnNumber;
    log(state, `${pl.userId} coloca boca abajo un apoyo.`);
    return { ok: true };
  }

  return resolveActivation(state, controllerIndex, instanceId, card, targets, null, slot);
}

// Activates a support that was set face-down in the support zone: turn it face-up, pay its
// activation cost and resolve it like any other activation. Normal/Continuo/Equipo only in your
// own Fase Principal; Veloz/Contraataque whenever their speed allows (also through ACTIVATE_EFFECT,
// which routes a face-down one here).
function activateSetSupport(state, controllerIndex, instanceId, { targets = [] } = {}) {
  const pl = player(state, controllerIndex);
  const entry = pl.field.support.find((s) => s && s.instanceId === instanceId);
  if (!entry || !entry.faceDown) return { ok: false, reason: 'not-set-support' };
  const card = getCard(entry.cardId);
  const fast = card.subtype === 'instant' || card.subtype === 'counter';
  if (!fast && state.phase !== 'main1' && state.phase !== 'main2') return { ok: false, reason: 'not-main-phase' };
  return resolveActivation(state, controllerIndex, instanceId, card, targets, entry);
}

// Rulebook: every check comes first — the Pila's timing, the card's own conditions and targets, a
// free zone to put it in — and only then is anything paid. If paying fails part-way through, the
// whole activation is undone (nothing stays half-paid).
function resolveActivation(state, controllerIndex, instanceId, card, targets, setEntry = null, slot = null) {
  const pl = player(state, controllerIndex);
  const ctx = { state, controllerIndex, sourceInstanceId: instanceId };

  // Rulebook, Velocidades/Apilar: legal speed- and timing-wise before it can go on the Pila —
  // Normal/Continuo/Equipo/Tierra (Speed 1) only in your own Fase Principal with nothing on it.
  const speed = speedOf(card);
  const blocked = linkBlockReason(state, controllerIndex, speed);
  if (blocked) return { ok: false, reason: blocked };

  if (violatesUnique(state, controllerIndex, card)) return { ok: false, reason: 'unique-card' };

  // Rulebook, Cartas de Equipo: an Equipo card always names the monster it goes on when you
  // activate it — there's no "activate it plain" the way a Normal/Continuo card works.
  let equipTarget = null;
  if (card.subtype === 'equipment') {
    const candidates = legalEquipTargets(state, controllerIndex, card);
    const picked = targets.find((t) => candidates.some((m) => m.instanceId === t));
    const namedMonster = targets.find((t) => require('./zones').getFieldMonster(state, t));
    if (namedMonster && !picked) return { ok: false, reason: 'invalid-equip-target' };
    if (!candidates.length) return { ok: false, reason: 'no-legal-equip-target' };
    if (!picked && candidates.length > 1) return { ok: false, reason: 'choose-target', options: candidates.map(describeFieldTarget), prompt: 'Elige el monstruo que equipas' };
    equipTarget = picked || candidates[0].instanceId;
  }

  // A zone to put it in (a card already set face-down has its own; a Territorio replaces the old).
  if (!setEntry && card.subtype !== 'field') {
    const blockedSlots = corrodedSlots(pl, 'support');
    const free = slot === null || slot === undefined
      ? pl.field.support.some((s, i) => s === null && !blockedSlots.includes(i))
      : slot >= 0 && slot < pl.field.support.length && pl.field.support[slot] === null && !blockedSlots.includes(slot);
    if (!free) return { ok: false, reason: 'no-field-space' };
  }

  // Effects that will actually run right now (their zone/conditions already satisfied).
  const allOnPlay = onPlayEffects(card);
  const runningEffects = allOnPlay.filter((effect) => responseWindowOpen(state, controllerIndex, effect) && checkConditions({ ...ctx, effect }, effect.conditions));
  // A card that only answers something ("cuando tu oponente activa...", "cuando un monstruo declara
  // un ataque directo") can't be used when that isn't what's happening.
  if (allOnPlay.length && allOnPlay.every(isResponseEffect) && !runningEffects.length) return { ok: false, reason: 'no-response-window' };
  if (allOnPlay.length && !runningEffects.length && allOnPlay.every((e) => e.conditions && e.conditions.length)) return { ok: false, reason: 'conditions-not-met' };

  // Rulebook: the player picks what pays the costs first, then what the effects act on.
  const cost = card.activationCost;
  const costChoice = (cost && pendingCostChoice(ctx, cost, targets))
    || runningEffects.map((effect) => effect.cost && pendingCostChoice({ ...ctx, effect }, effect.cost, targets)).find(Boolean);
  if (costChoice) return { ok: false, reason: 'choose-target', options: [...costChoice], prompt: costChoice.prompt };
  const costTaken = [...costPicks(ctx, cost, targets), ...runningEffects.flatMap((effect) => costPicks({ ...ctx, effect }, effect.cost, targets))];
  const effectTargets = targets.filter((t) => t !== equipTarget);
  const effectChoice = runningEffects.map((effect) => pendingEffectChoice({ ...ctx, effect }, effect, effectTargets, costTaken)).find(Boolean);
  if (effectChoice) return { ok: false, reason: 'choose-target', ...effectChoice };

  const snap = snapshot(state);
  const fail = (reason) => {
    restore(state, snap);
    return { ok: false, reason };
  };
  if (cost && cost.fn && !payCost(ctx, cost, targets)) return fail('cannot-pay-cost');
  // Some cards add a cost inside their effect ("destruye un monstruo en tu Campo:").
  if (!runningEffects.every((effect) => !effect.cost || payCost({ ...ctx, effect }, effect.cost, targets))) return fail('cannot-pay-cost');

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
      if (!entry) return fail('no-field-space');
    }
    if (card.subtype === 'equipment') entry.equippedTo = equipTarget;
  }
  if (pl.hand.includes(instanceId)) pl.hand = pl.hand.filter((id) => id !== instanceId);
  log(state, `${pl.userId} coloca ${card.name} en el Campo.`);
  if (card.subtype === 'equipment' && equipTarget) log(state, `${card.name} se equipa a ${require('./statMods').sourceName(state, equipTarget)}.`);

  const oneShot = card.subtype === 'normal' || card.subtype === 'instant' || card.subtype === 'counter';
  if (!runningEffects.length) {
    // Nothing to resolve (a pure Continuo buff, say) — nothing goes on the Pila.
    recomputeContinuous(state);
    checkWin(state);
    return { ok: true };
  }

  addLink(state, { controllerIndex, sourceInstanceId: instanceId, cardName: card.name, effects: runningEffects, targets: effectTargets.filter((t) => !costTaken.includes(t)), speed, afterResolve: oneShot ? 'graveyard' : null, costPaid: ctx.paidCards || [] });
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
  const hasFilter = Object.values(filter).some(Boolean);
  const { canAffect } = require('./targets');
  return player(state, side).field.monsters.filter((m) => m && !m.faceDown && (!hasFilter || matchesFilter(m, filter)) && canAffect({ state, controllerIndex, sourceInstanceId: null }, m));
}

function describeFieldTarget(m) {
  if (m.isToken) return { instanceId: m.instanceId, name: m.tokenDef.name, image: null };
  const card = getCard(m.cardId);
  return { instanceId: m.instanceId, cardId: card._id.toString(), name: card.name, image: card.image };
}

// A support card's own on-play effect(s) — resolved right as the card is activated. A card can
// also grant a SEPARATE effect meant to be activated later, once it's actually sitting in the
// graveyard/exile/back on the field (e.g. Enjambre de Avispas' graveyard ability, Relicario's
// counters) — those are only reachable through a later, explicit ACTIVATE_EFFECT, never fired here.
// A "triggered" one (Nido de Avispas) waits for its event and a "continuous" one is recomputed.
const ON_PLAY_EFFECT_TYPES = ['activated', 'quick', 'ignition'];

function onPlayEffects(card) {
  return (card.effectCodes || [])
    .map((effectId) => getEffect(effectId))
    .filter((effect) => effect && ON_PLAY_EFFECT_TYPES.includes(effect.type))
    .filter((effect) => !['graveyard', 'banished', 'field'].includes(requiredZoneFor(effect)));
}

module.exports = { activateSupport, activateSetSupport, onPlayEffects };
