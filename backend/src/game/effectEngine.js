const { getEffect, getCard } = require('./cardIndex');
const { checkConditions, markLimitUsed } = require('./effects/conditions');
const { payCost } = require('./effects/costs');
const { runAction, checkWin } = require('./effects/actions');
const { player, log, findInstanceLocation } = require('./zones');
const { cardIdFromInstance } = require('./deckUtils');

function makeCtx(state, controllerIndex, effect, sourceInstanceId) {
  return { state, controllerIndex, sourceInstanceId, effect };
}

// Rulebook: "Si está en el cementerio / Si está en el exilio" (monsters) and the second,
// graveyard-only effect some Apoyo Normal cards have both require the card to actually be
// sitting in that zone right now — this is the shared convention effect authoring used for
// that ("onActivation" with args.from, or the shorthand "onGraveyard").
function requiredZoneFor(effect) {
  if (!effect.trigger) return null;
  if (effect.trigger.fn === 'onActivation' && effect.trigger.args && effect.trigger.args.from) {
    return effect.trigger.args.from === 'graveyard' ? 'graveyard' : effect.trigger.args.from === 'banished' ? 'banished' : null;
  }
  if (effect.trigger.fn === 'onGraveyard') return 'graveyard';
  return null;
}

// Player-initiated activation (quick / ignition / activated). Returns {ok, reason?}.
function activateEffect(state, controllerIndex, effectId, sourceInstanceId, targets = []) {
  const effect = getEffect(effectId);
  if (!effect) return { ok: false, reason: 'unknown-effect' };

  const requiredZone = requiredZoneFor(effect);
  if (requiredZone) {
    const loc = findInstanceLocation(state, sourceInstanceId);
    if (!loc || loc.zone !== requiredZone || loc.ownerIndex !== controllerIndex) {
      return { ok: false, reason: requiredZone === 'graveyard' ? 'not-in-graveyard' : 'not-in-exile' };
    }
  }

  const ctx = makeCtx(state, controllerIndex, effect, sourceInstanceId);

  if (effect.oncePerTurn) {
    state.turnLimits = state.turnLimits || {};
    const key = `${state.turnNumber}:${effectId}`;
    if (state.turnLimits[key]) return { ok: false, reason: 'once-per-turn' };
  }

  if (!checkConditions(ctx, effect.conditions)) return { ok: false, reason: 'conditions-not-met' };

  if (effect.cost) {
    const paid = payCost(ctx, effect.cost, targets);
    if (!paid) return { ok: false, reason: 'cannot-pay-cost' };
  }

  resolveActions(ctx, effect, targets);

  if (effect.oncePerTurn) {
    const key = `${state.turnNumber}:${effectId}`;
    state.turnLimits[key] = true;
  }
  const cond = (effect.conditions || []).find((c) => c.fn === 'limitPerTurn');
  if (cond) markLimitUsed(state, cond.args.name);

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

// Fires every triggered/trigger effect on the board that matches `eventName`, in field order.
// Simplified compared to a real chain: resolves immediately, turn-player's triggers first.
function fireTrigger(state, eventName, eventArgs = {}) {
  const order = [state.turnPlayer, state.turnPlayer === 0 ? 1 : 0];
  order.forEach((controllerIndex) => {
    const pl = player(state, controllerIndex);
    pl.field.monsters.filter(Boolean).forEach((m) => {
      if (m.faceDown || m.negated || m.isToken) return;
      const card = getCard(m.cardId);
      (card.effectCodes || []).forEach((effectId) => {
        const effect = getEffect(effectId);
        if (!effect || (effect.type !== 'triggered' && effect.type !== 'trigger')) return;
        if (!effect.trigger || effect.trigger.fn !== eventName) return;
        if (eventArgs.breed && effect.trigger.args && effect.trigger.args.monsterFamily && effect.trigger.args.monsterFamily !== eventArgs.breed) return;
        const ctx = makeCtx(state, controllerIndex, effect, m.instanceId);
        if (!checkConditions(ctx, effect.conditions)) return;
        if (effect.oncePerTurn) {
          state.turnLimits = state.turnLimits || {};
          const key = `${state.turnNumber}:${effectId}`;
          if (state.turnLimits[key]) return;
          state.turnLimits[key] = true;
        }
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
  state.players.forEach((pl) => {
    pl.field.monsters.filter(Boolean).forEach((m) => { m.tempBuff = { atk: 0, def: 0 }; });
  });
  state.players.forEach((pl, controllerIndex) => {
    [...pl.field.monsters, ...pl.field.support].filter(Boolean).forEach((entry) => {
      if (entry.faceDown || entry.isToken) return;
      const card = getCard(entry.cardId);
      (card.effectCodes || []).forEach((effectId) => {
        const effect = getEffect(effectId);
        if (!effect || effect.type !== 'continuous') return;
        const ctx = makeCtx(state, controllerIndex, effect, entry.instanceId);
        if (!checkConditions(ctx, effect.conditions)) return;
        resolveActions(ctx, effect, []);
      });
    });
  });
}

function getEffectiveStats(monsterEntry) {
  const buff = monsterEntry.tempBuff || { atk: 0, def: 0 };
  return {
    atk: Math.max(0, monsterEntry.baseAtk + buff.atk),
    def: Math.max(0, monsterEntry.baseDef + buff.def),
  };
}

module.exports = { activateEffect, fireTrigger, recomputeContinuous, getEffectiveStats };
