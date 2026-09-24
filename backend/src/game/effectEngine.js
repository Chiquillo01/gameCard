const { getEffect, getCard, effectCodesOf } = require('./cardIndex');
const { checkConditions, markLimitUsed, markCardEffectUsed } = require('./effects/conditions');
const { matchesCardFilter, matchesFilter } = require('./filters');
const { payCost, pendingCostChoice, costPicks } = require('./effects/costs');
const { runAction } = require('./effects/actions');
const { checkWin } = require('./outcome');
const { player, log, findInstanceLocation, getFieldMonster } = require('./zones');
const { cardIdFromInstance } = require('./deckUtils');
const { hasStatus, poisonDebuff, FREEZE } = require('./statuses');
const { speedOf, linkBlockReason, addLink, responseWindowOpen } = require('./chain');
const { isNegated } = require('./negation');
const { assignPicks, pendingEffectChoice, hasNoLegalTarget, activeSteps } = require('./targets');
const { snapshot, restore } = require('./stateSnapshot');

function makeCtx(state, controllerIndex, effect, sourceInstanceId) {
  return { state, controllerIndex, sourceInstanceId, effect };
}

// Rulebook: "Si está en el cementerio / Si está en el exilio" (monsters) and the second,
// graveyard-only effect some Apoyo Normal cards have both require the card to actually be
// sitting in that zone right now — this is the shared convention effect authoring used for
// that (`from` on the trigger's args, or the shorthand "onGraveyard"). Kraken/Rakshasa ("descarta
// esta carta") are used from the hand the same way.
function requiredZoneFor(effect) {
  if (!effect.trigger) return null;
  const from = effect.trigger.args && effect.trigger.args.from;
  if (from) return ['graveyard', 'banished', 'hand', 'field'].includes(from) ? from : null;
  if (effect.trigger.fn === 'onGraveyard') return 'graveyard';
  return null;
}

// True when `loc` (from findInstanceLocation) is actually in the zone `requiredZone` names.
function locationIsInZone(loc, requiredZone) {
  if (!loc) return false;
  if (requiredZone === 'field') return loc.zone === 'field:monster' || loc.zone === 'field:support' || loc.zone === 'field:territory';
  return loc.zone === requiredZone;
}

function fieldEntryAt(state, loc) {
  if (!loc) return null;
  const pl = state.players[loc.ownerIndex];
  if (loc.zone === 'field:monster') return pl.field.monsters[loc.slot];
  if (loc.zone === 'field:support') return pl.field.support[loc.slot];
  if (loc.zone === 'field:territory') return pl.field.territory;
  return null;
}

// Which effects a card instance has where it is: a field entry may carry copied ones (Doppelganger).
function effectIdsAt(state, instanceId) {
  const entry = fieldEntryAt(state, findInstanceLocation(state, instanceId));
  return entry ? effectCodesOf(entry) : (getCard(cardIdFromInstance(instanceId)).effectCodes || []);
}

// "Solo puede haber uno": a card whose own data limits it (limitUnique) can't be brought out while
// its controller already has a face-up one of that name on the field (Ángel de Platino).
function violatesUnique(state, controllerIndex, card) {
  const names = (card.effectCodes || []).map(getEffect).filter(Boolean)
    .flatMap((e) => (e.actions || []).filter((a) => a.fn === 'limitUnique').map((a) => (a.args && (a.args.filter?.name || a.args.name)) || card.name));
  if (!names.length) return false;
  const pl = player(state, controllerIndex);
  return [...pl.field.monsters, ...pl.field.support, pl.field.territory].some((e) => e && !e.faceDown && !e.isToken && names.includes(getCard(e.cardId).name));
}

// A pending choice as { options, prompt }: pendingEffectChoice already returns that shape;
// pendingCostChoice returns the options array with its prompt attached.
const asChoice = (c) => (Array.isArray(c) ? { options: [...c], prompt: c.prompt } : c);
const chooseTarget = (choice) => ({ ok: false, reason: 'choose-target', ...asChoice(choice) });

// Player-initiated activation (quick / ignition / activated). Returns {ok, reason?}.
function activateEffect(state, controllerIndex, effectId, sourceInstanceId, targets = []) {
  const effect = getEffect(effectId);
  if (!effect) return { ok: false, reason: 'unknown-effect' };
  const loc = findInstanceLocation(state, sourceInstanceId);
  if (!loc || loc.ownerIndex !== controllerIndex) return { ok: false, reason: 'not-your-card' };
  // Rulebook, Congelado: a frozen card can't activate its effects (even from the graveyard).
  if (hasStatus(state, sourceInstanceId, FREEZE)) return { ok: false, reason: 'frozen' };
  // Only an effect this card actually has (its own, or one it copied) — never an arbitrary id.
  if (!effectIdsAt(state, sourceInstanceId).includes(effectId)) return { ok: false, reason: 'unknown-effect' };

  // A Veloz/Contraataque set face-down is activated by turning it over, paying its activation cost
  // and going to the Cementerio afterwards — exactly like activating it from the hand.
  const entry = fieldEntryAt(state, loc);
  if (entry && loc.zone === 'field:support' && entry.faceDown) {
    return require('./support').activateSetSupport(state, controllerIndex, sourceInstanceId, { targets });
  }
  if (entry && entry.faceDown) return { ok: false, reason: 'face-down' };
  if (entry && entry.isMonsterEquip) return { ok: false, reason: 'unknown-effect' };

  // Effects that don't say which zone they need (most monster ignition/quick abilities) default to
  // "must be face-up on the field" — the ordinary case for that kind of ability.
  const requiredZone = requiredZoneFor(effect) || 'field';
  if (!locationIsInZone(loc, requiredZone)) {
    return { ok: false, reason: `not-in-${requiredZone === 'banished' ? 'exile' : requiredZone}` };
  }

  const ctx = makeCtx(state, controllerIndex, effect, sourceInstanceId);
  const card = getCard(cardIdFromInstance(sourceInstanceId));
  // Rulebook, Velocidades/Apilar: legal speed- and timing-wise before it can go on the Pila.
  const speed = speedOf(card, effect);
  const blocked = linkBlockReason(state, controllerIndex, speed);
  if (blocked) return { ok: false, reason: blocked };
  if (!responseWindowOpen(state, controllerIndex, effect)) return { ok: false, reason: 'no-response-window' };

  // "Una vez por turno" limits THIS card's own use of its effect — two copies of the same card
  // each get their own turn, so the key includes the source instance, not just the effect id.
  if (effect.oncePerTurn) {
    state.turnLimits = state.turnLimits || {};
    const key = `${state.turnNumber}:${effectId}:${sourceInstanceId}`;
    if (state.turnLimits[key]) return { ok: false, reason: 'once-per-turn' };
  }

  if (!checkConditions(ctx, effect.conditions)) return { ok: false, reason: 'conditions-not-met' };
  if (hasNoLegalTarget(ctx, effect)) return { ok: false, reason: 'no-legal-target' };

  // Rulebook: the player picks — first what pays the cost, then what the effect acts on.
  const costChoice = effect.cost && pendingCostChoice(ctx, effect.cost, targets);
  if (costChoice) return chooseTarget(costChoice);
  const costTaken = costPicks(ctx, effect.cost, targets);
  const effectChoice = pendingEffectChoice(ctx, effect, targets, costTaken);
  if (effectChoice) return chooseTarget(effectChoice);

  const snap = snapshot(state);
  if (effect.cost && !payCost(ctx, effect.cost, targets)) {
    restore(state, snap);
    return { ok: false, reason: 'cannot-pay-cost' };
  }

  // The ACTIVATION is what "una vez por turno" limits, not whether it goes on to resolve — a
  // negated effect still used up the turn's activation, same as a real TCG.
  if (effect.oncePerTurn) state.turnLimits[`${state.turnNumber}:${effectId}:${sourceInstanceId}`] = true;
  const cond = (effect.conditions || []).find((c) => c.fn === 'limitPerTurn');
  if (cond) markLimitUsed(state, cond.args.name, sourceInstanceId);

  addLink(state, { controllerIndex, sourceInstanceId, cardName: card.name, effects: [effect], targets: targets.filter((t) => !costTaken.includes(t)), speed, costPaid: ctx.paidCards || [] });
  checkWin(state);
  return { ok: true };
}

// Runs an effect's steps. Each step that involves a choice (targets.js) gets only its own picks —
// or, when there was nothing to choose between, the few candidates there are; a step whose pick
// is gone by now (destroyed in response, say) simply does nothing. Steps without a choice get the
// rest of `targets` as before (an Equipo's continuous effect gets the monster it's equipped to).
function resolveActions(ctx, effect, targets = []) {
  const list = Array.isArray(targets) ? targets : [];
  const exclude = ctx.costPaid || [];
  const assigned = assignPicks(ctx, effect, list, exclude);
  const byIndex = new Map(assigned.map((a) => [a.index, a]));
  activeSteps(effect, list).forEach(({ step, index }) => {
    const a = byIndex.get(index);
    let stepTargets;
    if (a && a.pool) {
      // Pools are re-read right before each step runs: an earlier step may have moved cards.
      const { stepPool, stepCount } = require('./targets');
      const pool = (stepPool(ctx, step) || []).filter((t) => !exclude.includes(t));
      const count = stepCount(ctx, step);
      stepTargets = a.picks.filter((t) => pool.includes(t));
      if (!a.picks.length && pool.length <= count) stepTargets = pool;
      if (!stepTargets.length) {
        if (step.fn === 'destroy' || step.fn === 'destroyUpToHeroCount') ctx.destroyedCount = 0;
        return;
      }
    } else {
      stepTargets = list.filter((t) => !exclude.includes(t) && !(typeof t === 'string' && t.startsWith('choice:')));
    }
    runAction(ctx, step, stepTargets);
  });
}

// --- Triggered effects ---------------------------------------------------------------------------
// Events about one specific card: only that card's own effects fire for them.
const SELF_EVENTS = ['flipped', 'onSummon', 'sentToGraveyard', 'beforeDamageCalculation', 'battleDamageDealt', 'dealsDamageToOpponent', 'destroysMonsterInBattle', 'summonedByEffect', 'summonedByCardEffect'];
// The effect data names the end of the Battle Phase two ways.
const TIMING_ALIASES = { battlePhaseEnd: 'endOfBattlePhase' };
const sameWord = (a, b) => String(a || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase() === String(b || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Whether this trigger's own args accept this particular event.
function triggerAccepts(state, m, effect, eventName, eventArgs) {
  const args = (effect.trigger && effect.trigger.args) || {};
  const eventCard = eventArgs.cardId ? getCard(eventArgs.cardId) : null;
  // "Cuando un Pez es destruido" / "cuando se invoca un Insecto": by breed or family.
  if (args.monsterFamily && eventCard && !(sameWord(eventCard.breed, args.monsterFamily) || sameWord(eventCard.family, args.monsterFamily))) return false;
  if (args.monsterFamily && !eventCard && eventArgs.breed && !sameWord(eventArgs.breed, args.monsterFamily)) return false;
  if (eventName === 'phase' && args.timing && (TIMING_ALIASES[args.timing] || args.timing) !== eventArgs.timing) return false;
  if (eventName === 'allySummoned' && eventArgs.cardId && !matchesCardFilter(getCard(eventArgs.cardId), args.filter || {})) return false;
  // "Cuando es invocado por el efecto de un Licano".
  const bySource = eventArgs.bySourceCardId ? getCard(eventArgs.bySourceCardId) : null;
  if (eventName === 'onSummon' && args.by === 'effect') {
    if (!eventArgs.byEffect) return false;
    if (args.filter && !(bySource && matchesCardFilter(bySource, args.filter))) return false;
  }
  if ((eventName === 'summonedByEffect' || eventName === 'summonedByCardEffect') && args.breed && !(bySource && matchesCardFilter(bySource, { breed: args.breed }))) return false;
  if (eventName === 'onMonsterDestroyed') {
    if (args.target === 'self' && m.instanceId !== eventArgs.instanceId) return false;
    if (args.reason && !([].concat(args.reason)).includes(eventArgs.reason)) return false;
  }
  if (eventName === 'direct_damage_dealt') {
    if (eventArgs.controllerIndex !== m.controllerIndex) return false;
    if (args.source === 'self' && m.instanceId !== eventArgs.instanceId) return false;
    if (args.filter && !(eventCard && matchesCardFilter(eventCard, args.filter))) return false;
  }
  if (eventName === 'involvedInBattle') {
    const involved = [eventArgs.attackerInstanceId, eventArgs.defenderInstanceId].filter((id) => id && !(args.excludeSelf && id === m.instanceId));
    if (!involved.some((id) => { const e = getFieldMonster(state, id); return e && matchesFilter(e, args.filter || {}); })) return false;
  }
  return true;
}

// Fires every triggered/trigger effect on the board that matches, in field order (turn player's
// first). Sources are the face-up monsters and face-up Apoyo/Territorio cards on the field — plus the
// card an event is about when it has just left the field ("cuando es enviada al Cementerio",
// "si es destruida"). A negated card's triggers don't fire.
function fireTrigger(state, eventName, eventArgs = {}) {
  const order = [state.turnPlayer, state.turnPlayer === 0 ? 1 : 0];
  order.forEach((controllerIndex) => {
    const pl = player(state, controllerIndex);
    const sources = [...pl.field.monsters, ...pl.field.support, pl.field.territory].filter((e) => e && !e.isMonsterEquip);
    if ((eventName === 'sentToGraveyard' || eventName === 'onMonsterDestroyed') && eventArgs.ownerIndex === controllerIndex && eventArgs.cardId && !sources.some((s) => s.instanceId === eventArgs.instanceId)) {
      sources.push({ instanceId: eventArgs.instanceId, cardId: eventArgs.cardId, offField: true });
    }
    sources.forEach((m) => {
      if (m.faceDown || m.isToken || isNegated(state, m) || hasStatus(state, m.instanceId, FREEZE)) return;
      if (SELF_EVENTS.includes(eventName) && eventArgs.instanceId && m.instanceId !== eventArgs.instanceId) return;
      if (eventName === 'allySummoned' && (eventArgs.faceDown || eventArgs.controllerIndex !== controllerIndex || m.instanceId === eventArgs.instanceId)) return;
      const card = getCard(m.cardId);
      const codes = m.offField ? (card.effectCodes || []) : effectCodesOf(m);
      codes.forEach((effectId) => {
        const effect = getEffect(effectId);
        if (!effect || (effect.type !== 'triggered' && effect.type !== 'trigger')) return;
        if (!effect.trigger || effect.trigger.fn !== eventName) return;
        if (!triggerAccepts(state, { ...m, controllerIndex }, effect, eventName, eventArgs)) return;
        const ctx = { ...makeCtx(state, controllerIndex, effect, m.instanceId), event: eventArgs };
        if (!checkConditions(ctx, effect.conditions)) return;
        if (effect.oncePerTurn) {
          state.turnLimits = state.turnLimits || {};
          const key = `${state.turnNumber}:${effectId}:${m.instanceId}`;
          if (state.turnLimits[key]) return;
          state.turnLimits[key] = true;
        }
        if ((effect.conditions || []).some((cnd) => cnd.fn === 'oncePerCardOnField')) markCardEffectUsed(ctx);
        runTriggered(state, ctx, effect, card, []);
      });
    });
  });
  recomputeContinuous(state);
  checkWin(state);
}

// An automatic effect still leaves every real choice to its player (which card its cost takes,
// which alternative, what it searches or targets): with one to make it waits in
// state.pendingTriggerChoices — nothing else can happen until RESOLVE_TRIGGER_CHOICE answers it.
function runTriggered(state, ctx, effect, card, targets) {
  const costChoice = effect.cost && pendingCostChoice(ctx, effect.cost, targets);
  const costTaken = costPicks(ctx, effect.cost, targets);
  const choice = costChoice || pendingEffectChoice(ctx, effect, targets, costTaken);
  if (choice) {
    state.pendingTriggerChoices = state.pendingTriggerChoices || [];
    state.pendingTriggerChoices.push({ kind: 'effect', controllerIndex: ctx.controllerIndex, effectId: effect._id, sourceInstanceId: ctx.sourceInstanceId, event: ctx.event || null, ...asChoice(choice) });
    log(state, `${card.name} espera que elijas para su efecto.`);
    return false;
  }
  if (effect.cost && !payCost(ctx, effect.cost, targets)) {
    log(state, `No se puede pagar el coste de ${card.name}.`);
    return false;
  }
  resolveActions({ ...ctx, costPaid: ctx.paidCards || [] }, effect, targets.filter((t) => !costTaken.includes(t)));
  log(state, `Efecto disparado: ${effect._id} (${card.name}).`);
  return true;
}

// Answers the oldest pending choice:
//   kind 'slot'    — where a card lands (Avispa Mutante summoning itself; Íncubo moving), with `slot`;
//   kind 'discard' — which cards the player discards (hand limit, Esqueleto de relámpago);
//   kind 'effect'  — the picks an automatic effect was waiting for (answered round by round: the
//                    client resends every pick so far, and gets the next options until done).
function resolveTriggerChoice(state, controllerIndex, targets, slot = null) {
  const pending = state.pendingTriggerChoices && state.pendingTriggerChoices[0];
  if (!pending) return { ok: false, reason: 'no-pending-choice' };
  if (pending.controllerIndex !== controllerIndex) return { ok: false, reason: 'not-your-choice' };
  const picks = [...new Set((targets || []).filter((t) => t != null))];

  if (pending.kind === 'slot') {
    if (!pending.slots.includes(slot)) return { ok: false, reason: 'no-field-space' };
    state.pendingTriggerChoices.shift();
    if (pending.purpose === 'relocate') require('./effects/actions').relocateSelfFromChoice(state, pending, slot);
    else require('./summon').finishHandTrigger(state, pending.controllerIndex, pending.sourceInstanceId, getEffect(pending.effectId), slot);
    recomputeContinuous(state);
    checkWin(state);
    return { ok: true };
  }

  if (pending.kind === 'discard') {
    const pl = player(state, controllerIndex);
    const chosen = picks.filter((id) => pl.hand.includes(id));
    const need = Math.min(pending.count, pl.hand.length);
    if (chosen.length < need) return { ok: false, reason: 'choose-target', options: describeHand(state, controllerIndex, chosen), prompt: pending.prompt };
    state.pendingTriggerChoices.shift();
    chosen.slice(0, need).forEach((id) => require('./zones').moveToZone(state, id, 'graveyard'));
    log(state, `${pl.userId} descarta ${need} carta(s).`);
    recomputeContinuous(state);
    return { ok: true };
  }

  const effect = getEffect(pending.effectId);
  const card = getCard(cardIdFromInstance(pending.sourceInstanceId));
  const ctx = { ...makeCtx(state, pending.controllerIndex, effect, pending.sourceInstanceId), event: pending.event };
  const costChoice = effect.cost && pendingCostChoice(ctx, effect.cost, picks);
  const costTaken = costPicks(ctx, effect.cost, picks);
  const choice = costChoice || pendingEffectChoice(ctx, effect, picks, costTaken);
  if (choice) return chooseTarget(choice);
  state.pendingTriggerChoices.shift();
  runTriggered(state, ctx, effect, card, picks);
  recomputeContinuous(state);
  checkWin(state);
  return { ok: true };
}

function describeHand(state, playerIndex, exclude = []) {
  return player(state, playerIndex).hand.filter((id) => !exclude.includes(id)).map((id) => {
    const card = getCard(cardIdFromInstance(id));
    return { instanceId: id, cardId: card._id.toString(), name: card.name, image: card.image };
  });
}

// Continuous effects aren't stored as applied deltas — every mutation we recompute them fresh
// from current field state, which avoids "forgot to remove the buff" bugs entirely. That includes
// every flag a continuous effect can set, reset here first.
function recomputeContinuous(state) {
  releaseCorrosion(state);
  state.players.forEach((pl) => {
    pl.cantLose = false;
    pl.cantWin = false;
    pl.activationTax = 0;
    pl.field.monsters.filter(Boolean).forEach((m) => {
      m.tempBuff = poisonDebuff(state, m.instanceId);
      m.cannotBeDestroyedByBattle = false;
      m.immuneToOpponentEffects = false;
      m.negatedByContinuous = false;
      m.canAttackDirectly = false;
      m.extraAttacksContinuous = 0;
      m.untargetable = false;
      m.gainsAllTypes = false;
      m.equipLimit = 0;
      m.immuneAttributes = null;
    });
    [...pl.field.support, pl.field.territory].filter(Boolean).forEach((s) => { s.negatedByContinuous = false; });
  });
  applyTimedBuffs(state);
  state.players.forEach((pl, controllerIndex) => {
    [...pl.field.monsters, ...pl.field.support, pl.field.territory].filter(Boolean).forEach((entry) => {
      if (entry.faceDown || entry.isToken || entry.isMonsterEquip || hasStatus(state, entry.instanceId, FREEZE)) return;
      effectCodesOf(entry).forEach((effectId) => {
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
  // "El Atk de esta carta se convierte en X hasta el final del turno" wins over every other change.
  state.players.forEach((pl) => pl.field.monsters.filter(Boolean).forEach((m) => {
    if (m.atkOverride) m.tempBuff.atk = m.atkOverride.value - m.baseAtk;
  }));
  const { canStillAttack } = require('./combat');
  state.players.forEach((pl) => pl.field.monsters.filter(Boolean).forEach((m) => { m.hasAttacked = !canStillAttack(state, m); }));
}

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

// Everything that lasts "until the end of the turn" goes away as a turn ends (called before the
// turn number moves on).
function expireTimedBuffs(state) {
  state.timedBuffs = (state.timedBuffs || []).filter((b) => b.expiresTurn > state.turnNumber);
  state.players.forEach((pl) => pl.field.monsters.filter(Boolean).forEach((m) => {
    if (m.atkOverride && m.atkOverride.expiresTurn <= state.turnNumber) delete m.atkOverride;
    if (m.nameOverride && m.nameOverride.expiresTurn <= state.turnNumber) delete m.nameOverride;
    if (m.abilities) m.abilities = m.abilities.filter((a) => a.expiresTurn === null || a.expiresTurn > state.turnNumber);
  }));
}

// Rulebook, Corrosión: zones stop being corroded once the monster that corroded them leaves the
// field or is no longer face-up.
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
// compiled monsters count (by family, breed or attribute; the old key `compiledType`/`compiledFamily`
// means family).
function compiledMatches(compiledCard, args = {}) {
  const family = args.family || args.compiledType || args.compiledFamily;
  if (family && !sameWord(compiledCard.family, family)) return false;
  if (args.breed && !sameWord(compiledCard.breed, args.breed)) return false;
  if (args.attribute && !sameWord(compiledCard.attribute, args.attribute)) return false;
  return true;
}

const MATERIAL_TRIGGERS = ['usedAsMaterial', 'usedAsCompileMaterial', 'usedAsFusionMaterial'];

// "Ser usado como material de un monstruo compilado": each material card's own trigger effect
// fires when it is used for a compilation. The status/effects it applies come from a compiled
// monster, so they get the compiled-monster duration. `materialCounters` are the counters each
// material had on the field (Aporreador/Balista pass their Engranajes on).
function fireMaterialTriggers(state, controllerIndex, materialIds, compiledInstanceId, materialCounters = {}) {
  materialIds.forEach((id) => {
    if (id.startsWith('token:')) return;
    const card = getCard(cardIdFromInstance(id));
    (card.effectCodes || []).forEach((effectId) => {
      const effect = getEffect(effectId);
      if (!effect || (effect.type !== 'triggered' && effect.type !== 'trigger')) return;
      if (!effect.trigger || !MATERIAL_TRIGGERS.includes(effect.trigger.fn)) return;
      if (!compiledMatches(getCard(cardIdFromInstance(compiledInstanceId)), effect.trigger.args)) return;
      const ctx = { ...makeCtx(state, controllerIndex, effect, id), fromCompiled: true, event: { compiledInstanceId }, materialCounters: materialCounters[id] || {} };
      if (!checkConditions(ctx, effect.conditions)) return;
      runTriggered(state, ctx, effect, card, []);
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

module.exports = { activateEffect, resolveActions, fireTrigger, resolveTriggerChoice, expireTimedBuffs, fireMaterialTriggers, recomputeContinuous, getEffectiveStats, requiredZoneFor, locationIsInZone, violatesUnique, runTriggered, describeHand, effectIdsAt, fieldEntryAt };
