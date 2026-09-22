const { getEffect, getCard } = require('./cardIndex');
const { checkConditions, markLimitUsed, markCardEffectUsed } = require('./effects/conditions');
const { matchesCardFilter } = require('./filters');
const { payCost } = require('./effects/costs');
const { runAction, checkWin } = require('./effects/actions');
const { player, log, findInstanceLocation, getFieldMonster } = require('./zones');
const { cardIdFromInstance } = require('./deckUtils');
const { hasStatus, poisonDebuff, FREEZE } = require('./statuses');
const { pendingSearchChoice } = require('./effects/fieldActions');

function makeCtx(state, controllerIndex, effect, sourceInstanceId) {
  return { state, controllerIndex, sourceInstanceId, effect };
}

// Rulebook: "Si está en el cementerio / Si está en el exilio" (monsters) and the second,
// graveyard-only effect some Apoyo Normal cards have both require the card to actually be
// sitting in that zone right now — this is the shared convention effect authoring used for
// that ("onActivation" with args.from, or the shorthand "onGraveyard"). A few effects instead
// require the source still be in hand, or already out on the field.
function requiredZoneFor(effect) {
  if (!effect.trigger) return null;
  if (effect.trigger.fn === 'onActivation' && effect.trigger.args && effect.trigger.args.from) {
    return ['graveyard', 'banished', 'hand', 'field'].includes(effect.trigger.args.from) ? effect.trigger.args.from : null;
  }
  if (effect.trigger.fn === 'onGraveyard') return 'graveyard';
  return null;
}

// True when `loc` (from findInstanceLocation) is actually in the zone `requiredZone` names.
function locationIsInZone(loc, requiredZone) {
  if (!loc) return false;
  if (requiredZone === 'field') return loc.zone === 'field:monster' || loc.zone === 'field:support' || loc.zone === 'field:territory';
  return loc.zone === requiredZone;
}

// Player-initiated activation (quick / ignition / activated). Returns {ok, reason?}.
function activateEffect(state, controllerIndex, effectId, sourceInstanceId, targets = []) {
  const effect = getEffect(effectId);
  if (!effect) return { ok: false, reason: 'unknown-effect' };
  // Rulebook, Congelado: a frozen card can't activate its effects (even from the graveyard).
  if (hasStatus(state, sourceInstanceId, FREEZE)) return { ok: false, reason: 'frozen' };

  const requiredZone = requiredZoneFor(effect);
  if (requiredZone) {
    const loc = findInstanceLocation(state, sourceInstanceId);
    if (!loc || loc.ownerIndex !== controllerIndex || !locationIsInZone(loc, requiredZone)) {
      return { ok: false, reason: `not-in-${requiredZone === 'banished' ? 'exile' : requiredZone}` };
    }
  }

  const ctx = makeCtx(state, controllerIndex, effect, sourceInstanceId);

  // "Una vez por turno" limits THIS card's own use of its effect — two copies of the same card
  // each get their own turn, so the key includes the source instance, not just the effect id.
  if (effect.oncePerTurn) {
    state.turnLimits = state.turnLimits || {};
    const key = `${state.turnNumber}:${effectId}:${sourceInstanceId}`;
    if (state.turnLimits[key]) return { ok: false, reason: 'once-per-turn' };
  }

  if (!checkConditions(ctx, effect.conditions)) return { ok: false, reason: 'conditions-not-met' };

  // A search action (e.g. an ignition ability that adds a card from the deck) is the player's
  // pick, not automatic — with more than one legal match and nothing chosen yet, ask instead of
  // grabbing whichever the deck happens to put first.
  const searchOptions = pendingSearchChoice(state, controllerIndex, effect, targets);
  if (searchOptions) return { ok: false, reason: 'choose-target', options: searchOptions };

  if (effect.cost) {
    const paid = payCost(ctx, effect.cost, targets);
    if (!paid) return { ok: false, reason: 'cannot-pay-cost' };
  }

  resolveActions(ctx, effect, targets);

  if (effect.oncePerTurn) {
    const key = `${state.turnNumber}:${effectId}:${sourceInstanceId}`;
    state.turnLimits[key] = true;
  }
  const cond = (effect.conditions || []).find((c) => c.fn === 'limitPerTurn');
  if (cond) markLimitUsed(state, cond.args.name, sourceInstanceId);

  recomputeContinuous(state);
  checkWin(state);
  return { ok: true };
}

function resolveActions(ctx, effect, targets) {
  const actions = effect.actions || [];
  if (effect.choice) {
    // player picked exactly one alternative — `targets.chosenIndex` selects which
    const idx = (targets && targets.chosenIndex) || 0;
    if (actions[idx]) runAction(ctx, actions[idx], targets.forAction);
    return;
  }
  actions.forEach((step) => runAction(ctx, step, targets));
}

// Fires every triggered/trigger effect on the board that matches , in field order.
// Simplified compared to a real chain: resolves immediately, turn-player's triggers first.
// The sources are the face-up monsters and the face-up Apoyo/Territorio cards on the field.
//   - 'onSummon' / 'flipped' belong to the card the event is about (eventArgs.instanceId).
//   - 'allySummoned' fires for the controller's OTHER cards when a face-up monster matching the
//     effect's own filter was summoned on their side.
function fireTrigger(state, eventName, eventArgs = {}) {
  const order = [state.turnPlayer, state.turnPlayer === 0 ? 1 : 0];
  order.forEach((controllerIndex) => {
    const pl = player(state, controllerIndex);
    const sources = [...pl.field.monsters, ...pl.field.support, pl.field.territory].filter(Boolean);
    // A card that was just sent to the graveyard from the field is no longer on the field, but its
    // own "cuando es enviada al cementerio" effect still fires for it.
    if (eventName === 'sentToGraveyard' && eventArgs.ownerIndex === controllerIndex && eventArgs.cardId) {
      sources.push({ instanceId: eventArgs.instanceId, cardId: eventArgs.cardId });
    }
    sources.forEach((m) => {
      if (m.faceDown || m.negated || m.isToken || hasStatus(state, m.instanceId, FREEZE)) return;
      if ((eventName === 'flipped' || eventName === 'onSummon' || eventName === 'sentToGraveyard') && eventArgs.instanceId && m.instanceId !== eventArgs.instanceId) return;
      if (eventName === 'allySummoned' && (eventArgs.faceDown || eventArgs.controllerIndex !== controllerIndex || m.instanceId === eventArgs.instanceId)) return;
      const card = getCard(m.cardId);
      (card.effectCodes || []).forEach((effectId) => {
        const effect = getEffect(effectId);
        if (!effect || (effect.type !== 'triggered' && effect.type !== 'trigger')) return;
        if (!effect.trigger || effect.trigger.fn !== eventName) return;
        if (eventArgs.breed && effect.trigger.args && effect.trigger.args.monsterFamily && effect.trigger.args.monsterFamily !== eventArgs.breed) return;
        // A 'phase' trigger names which phase it wants (standbyPhase, mainPhase, endPhase, ...).
        if (eventName === 'phase' && effect.trigger.args && effect.trigger.args.timing && effect.trigger.args.timing !== eventArgs.timing) return;
        if (eventName === 'allySummoned' && eventArgs.cardId && !matchesCardFilter(getCard(eventArgs.cardId), (effect.trigger.args && effect.trigger.args.filter) || {})) return;
        const ctx = { ...makeCtx(state, controllerIndex, effect, m.instanceId), event: eventArgs };
        if (!checkConditions(ctx, effect.conditions)) return;
        if (effect.oncePerTurn) {
          state.turnLimits = state.turnLimits || {};
          const key = `${state.turnNumber}:${effectId}:${m.instanceId}`;
          if (state.turnLimits[key]) return;
          state.turnLimits[key] = true;
        }
        if ((effect.conditions || []).some((cnd) => cnd.fn === 'oncePerCardOnField')) markCardEffectUsed(ctx);
        resolveActions(ctx, effect, []);
        log(state, `Efecto disparado: ${effectId} (${card.name}).`);
      });
    });
  });
  recomputeContinuous(state);
  checkWin(state);
}

// Continuous effects aren't stored as applied deltas — every mutation we recompute them fresh
// from current field state, which avoids "forgot to remove the buff" bugs entirely.
function recomputeContinuous(state) {
  releaseCorrosion(state);
  state.players.forEach((pl) => {
    pl.field.monsters.filter(Boolean).forEach((m) => {
      m.tempBuff = poisonDebuff(state, m.instanceId);
      m.cannotBeDestroyedByBattle = false;
      m.immuneToOpponentEffects = false;
    });
  });
  applyTimedBuffs(state);
  state.players.forEach((pl, controllerIndex) => {
    [...pl.field.monsters, ...pl.field.support, pl.field.territory].filter(Boolean).forEach((entry) => {
      if (entry.faceDown || entry.isToken || hasStatus(state, entry.instanceId, FREEZE)) return;
      const card = getCard(entry.cardId);
      (card.effectCodes || []).forEach((effectId) => {
        const effect = getEffect(effectId);
        if (!effect || effect.type !== 'continuous') return;
        // An Equipo card's effect only runs for the monster it's equipped to; with none (or that
        // monster gone) it does nothing until the field-leave cleanup sends the card to the graveyard.
        const isEquip = effect.trigger && effect.trigger.fn === 'whileEquipped';
        if (isEquip && !getFieldMonster(state, entry.equippedTo)) return;
        const ctx = makeCtx(state, controllerIndex, effect, entry.instanceId);
        if (!checkConditions(ctx, effect.conditions)) return;
        resolveActions(ctx, effect, isEquip ? [entry.equippedTo] : []);
      });
    });
  });
}

// Rulebook, Corrosión: zones stop being corroded once the monster that corroded them leaves the
// field or is no longer face-up.
// "Hasta el final del turno" buffs, kept on the state and dropped when that turn is over.
function applyTimedBuffs(state) {
  (state.timedBuffs || []).forEach(({ ids, buff }) => {
    state.players.flatMap((p) => p.field.monsters).filter((m) => m && ids.includes(m.instanceId)).forEach((m) => {
      m.tempBuff = m.tempBuff || { atk: 0, def: 0 };
      m.tempBuff.atk += buff.atk || 0;
      m.tempBuff.def += buff.def || 0;
    });
  });
}

function expireTimedBuffs(state) {
  state.timedBuffs = (state.timedBuffs || []).filter((b) => b.expiresTurn > state.turnNumber);
}

function releaseCorrosion(state) {
  state.players.forEach((pl) => {
    if (!pl.corrosion || !pl.corrosion.length) return;
    pl.corrosion = pl.corrosion.filter((c) => {
      const src = state.players.flatMap((p) => p.field.monsters).find((m) => m && m.instanceId === c.sourceInstanceId);
      return src && !src.faceDown;
    });
  });
}

// "Si se usa como material para una Compilación Insecto/Agua/Hada": the trigger's args narrow which
// compiled monsters count (by family, breed or attribute; the old key `compiledType` means family).
function compiledMatches(compiledCard, args = {}) {
  const same = (a, b) => (a || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase() === (b || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const family = args.family || args.compiledType;
  if (family && !same(compiledCard.family, family)) return false;
  if (args.breed && !same(compiledCard.breed, args.breed)) return false;
  if (args.attribute && !same(compiledCard.attribute, args.attribute)) return false;
  return true;
}

function getCompiledCardId(state, instanceId) {
  return cardIdFromInstance(instanceId);
}

const MATERIAL_TRIGGERS = ['usedAsMaterial', 'usedAsCompileMaterial', 'usedAsFusionMaterial'];

// "Ser usado como material de un monstruo compilado": each material card's own trigger effect
// fires when it is used for a compilation. The status/effects it applies come from a compiled
// monster, so they get the compiled-monster duration.
function fireMaterialTriggers(state, controllerIndex, materialIds, compiledInstanceId) {
  materialIds.forEach((id) => {
    if (id.startsWith('token:')) return;
    const card = getCard(cardIdFromInstance(id));
    (card.effectCodes || []).forEach((effectId) => {
      const effect = getEffect(effectId);
      if (!effect || (effect.type !== 'triggered' && effect.type !== 'trigger')) return;
      if (!effect.trigger || !MATERIAL_TRIGGERS.includes(effect.trigger.fn)) return;
      if (!compiledMatches(getCard(getCompiledCardId(state, compiledInstanceId)), effect.trigger.args)) return;
      const ctx = { ...makeCtx(state, controllerIndex, effect, id), fromCompiled: true, event: { compiledInstanceId } };
      if (!checkConditions(ctx, effect.conditions)) return;
      resolveActions(ctx, effect, []);
      log(state, `Efecto de material: ${effectId} (${card.name}).`);
    });
  });
  recomputeContinuous(state);
  checkWin(state);
}

function getEffectiveStats(monsterEntry) {
  const buff = monsterEntry.tempBuff || { atk: 0, def: 0 };
  return {
    atk: Math.max(0, monsterEntry.baseAtk + buff.atk),
    def: Math.max(0, monsterEntry.baseDef + buff.def),
  };
}

module.exports = { activateEffect, fireTrigger, expireTimedBuffs, fireMaterialTriggers, recomputeContinuous, getEffectiveStats, requiredZoneFor, locationIsInZone };
