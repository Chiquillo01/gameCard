const { createMatchState } = require('./state');
const { advancePhase, runPhaseEntry } = require('./turns');
const { normalSummon, specialSummon, compileSummon, decompile } = require('./summon');
const { canBeNormalSummoned, cannotBeSummoned } = require('./summonRules');
const { hasStatus, statusesOf, FREEZE } = require('./statuses');
const { activateSupport, activateSetSupport } = require('./support');
const { declareAttack, attackBlockReason } = require('./combat');
const { changePosition } = require('./position');
const { activateEffect, resolveTriggerChoice, requiredZoneFor, locationIsInZone, effectIdsAt, fieldEntryAt, describeHand } = require('./effectEngine');
const { passPriority, speedOf, linkBlockReason, responseWindowOpen } = require('./chain');
const { checkConditions } = require('./effects/conditions');
const { getCard, getEffect, loadCardIndex } = require('./cardIndex');
const { player, opponentIndex, findInstanceLocation } = require('./zones');

// Player-initiated effect types (as opposed to 'triggered'/'trigger', which fire automatically,
// 'continuous', which is passive, and 'summon_rule'/'rule', which are static).
const PLAYER_ACTIVATABLE_TYPES = ['activated', 'quick', 'ignition'];

// Effect ids this card instance can send as ACTIVATE_EFFECT right now, from its owner's point of
// view — computed server-side so the client never has to know the effect catalog itself, just
// which buttons to show. Only the ones whose timing is legal right now (the Pila's speed rules and
// "cuando ..." response windows); whether costs/conditions hold is found out when it's tried.
function computeAvailableEffects(state, ownerIndex, instanceId, cardId) {
  const card = getCard(cardId);
  const loc = findInstanceLocation(state, instanceId);
  if (!loc || loc.ownerIndex !== ownerIndex) return [];
  if (hasStatus(state, instanceId, FREEZE)) return [];
  const entry = fieldEntryAt(state, loc);
  if (entry && entry.isMonsterEquip) return [];
  // A face-down Normal/Continuo/Equipo support is activated by turning it over (ACTIVATE_SET_SUPPORT),
  // which pays its cost; only Veloz/Contraataque cards act through their own effects while set.
  if (loc.zone === 'field:support' && entry && entry.faceDown && card.subtype !== 'instant' && card.subtype !== 'counter') return [];
  if (loc.zone === 'field:monster' && entry && entry.faceDown) return [];
  const setFast = loc.zone === 'field:support' && entry && entry.faceDown;
  return effectIdsAt(state, instanceId).filter((effectId) => {
    const effect = getEffect(effectId);
    if (!effect || !PLAYER_ACTIVATABLE_TYPES.includes(effect.type)) return false;
    // Effects that don't say which zone they need (most monster ignition/quick abilities)
    // default to "must be face-up on the field" — the ordinary case for that kind of ability.
    const requiredZone = requiredZoneFor(effect) || 'field';
    if (!setFast && !locationIsInZone(loc, requiredZone)) return false;
    if (linkBlockReason(state, ownerIndex, speedOf(card, effect))) return false;
    return responseWindowOpen(state, ownerIndex, effect);
  });
}

async function createMatch(opts) {
  await loadCardIndex();
  const state = createMatchState(opts);
  if (opts.coinToss) {
    const { log } = require('./zones');
    log(state, `Sorteo: sale ${opts.coinToss}. Empieza ${state.players[state.turnPlayer].userId === 'BOT' ? 'el BOT' : state.players[state.turnPlayer].userId}.`);
  }
  runPhaseEntry(state); // processes turn 1's draw phase (no draw/income, per the rulebook) and marks it played
  return state;
}

// Rulebook: who goes first is decided by a coin toss — heads, the player who started the duel
// (playerA); tails, the other one.
function coinTossFirstPlayer(random = Math.random) {
  const heads = random() < 0.5;
  return { firstPlayer: heads ? 0 : 1, coinToss: heads ? 'cara' : 'cruz' };
}

// Single entry point for every player-initiated change. `action.type` selects the handler;
// returns { ok, reason?, state } — callers (socket/REST layer) broadcast `state` on success.
// Rulebook, "Apilar": while anything is on the Pila, the only legal move is whatever the current
// priority holder does about it — add a faster response (ACTIVATE_SUPPORT/ACTIVATE_EFFECT) or
// PASS_CHAIN — nobody, including the turn player, can advance the phase or take any other action
// until it clears.
const CHAIN_RESPONSE_TYPES = ['ACTIVATE_SUPPORT', 'ACTIVATE_EFFECT', 'PASS_CHAIN'];

function applyAction(state, playerIndex, action) {
  if (state.status !== 'active') return { ok: false, reason: 'match-finished' };

  if (action.type === 'SURRENDER') {
    // always allowed, regardless of chain/pending-choice state
  } else if (state.pendingTriggerChoices && state.pendingTriggerChoices.length > 0) {
    // An automatic trigger (Avispa de Obsidiana's on-summon search, say) is waiting on the
    // player's pick — nothing else can happen until they answer.
    if (action.type !== 'RESOLVE_TRIGGER_CHOICE') return { ok: false, reason: 'trigger-choice-pending' };
    if (playerIndex !== state.pendingTriggerChoices[0].controllerIndex) return { ok: false, reason: 'not-your-choice' };
  } else if (state.chain.length > 0) {
    if (!CHAIN_RESPONSE_TYPES.includes(action.type)) return { ok: false, reason: 'chain-open' };
    if (playerIndex !== state.priorityPlayer) return { ok: false, reason: 'not-your-priority' };
  } else if (playerIndex !== state.turnPlayer && !['ACTIVATE_EFFECT'].includes(action.type)) {
    return { ok: false, reason: 'not-your-turn' };
  }

  switch (action.type) {
    case 'ADVANCE_PHASE':
      return advancePhase(state);

    case 'NORMAL_SUMMON':
      return normalSummon(state, playerIndex, action.instanceId, {
        position: action.position || 'attack',
        faceDown: !!action.faceDown,
        slot: action.slot ?? null,
      });

    case 'SPECIAL_SUMMON':
      return specialSummon(state, playerIndex, action.instanceId, action.targets || [], action.slot ?? null);

    case 'ACTIVATE_SUPPORT':
      return activateSupport(state, playerIndex, action.instanceId, {
        targets: action.targets || [],
        setFaceDown: !!action.setFaceDown,
        slot: action.slot ?? null,
      });

    case 'ACTIVATE_SET_SUPPORT':
      return activateSetSupport(state, playerIndex, action.instanceId, { targets: action.targets || [] });

    case 'COMPILE_SUMMON':
      return compileSummon(state, playerIndex, action.instanceId, action.materialInstanceIds || [], action.slot ?? null);

    case 'DECLARE_ATTACK':
      return declareAttack(state, playerIndex, action.attackerInstanceId, action.targetInstanceId || null);

    case 'DECOMPILE':
      return decompile(state, playerIndex, action.instanceId);

    case 'CHANGE_POSITION':
      return changePosition(state, playerIndex, action.instanceId, action.position);

    case 'ACTIVATE_EFFECT':
      return activateEffect(state, playerIndex, action.effectId, action.sourceInstanceId, action.targets || []);

    case 'PASS_CHAIN':
      return passPriority(state, playerIndex);

    case 'RESOLVE_TRIGGER_CHOICE':
      return resolveTriggerChoice(state, playerIndex, action.targets || [], action.slot ?? null);

    case 'SURRENDER': {
      state.winnerIndex = opponentIndex(playerIndex);
      state.status = 'finished';
      return { ok: true };
    }

    default:
      return { ok: false, reason: 'unknown-action' };
  }
}

// A trimmed view safe to send to a given player: hides the opponent's hand/deck contents,
// keeps counts only.
function viewFor(state, viewerIndex) {
  const redactPlayer = (pl, idx) => {
    const isViewer = idx === viewerIndex;
    return {
      userId: pl.userId,
      vp: pl.vp,
      pixelcoins: pl.pixelcoins,
      normalSummonUsed: pl.normalSummonUsed,
      handCount: pl.hand.length,
      hand: isViewer ? pl.hand.map((id) => describeInstance(state, id, idx, isViewer)) : undefined,
      deckCount: pl.deck.length,
      extraCount: pl.extra.length,
      extra: isViewer ? pl.extra.map((id) => describeInstance(state, id, idx, isViewer)) : undefined,
      graveyard: pl.graveyard.map((id) => describeInstance(state, id, idx, isViewer)),
      banished: pl.banished.map((id) => describeInstance(state, id, idx, isViewer)),
      field: {
        monsters: pl.field.monsters.map((m) => (m ? describeFieldMonster(state, m, idx, isViewer) : null)),
        support: pl.field.support.map((s) => (s ? describeFieldSupport(state, s, idx, isViewer) : null)),
        territory: pl.field.territory ? describeFieldSupport(state, pl.field.territory, idx, isViewer) : null,
      },
    };
  };

  return {
    id: state.id,
    status: state.status,
    turnNumber: state.turnNumber,
    turnPlayer: state.turnPlayer,
    phase: state.phase,
    winnerIndex: state.winnerIndex,
    you: viewerIndex,
    players: state.players.map(redactPlayer),
    log: state.log.slice(-30),
    // Rulebook, "Apilar": null once the Pila is empty; while it isn't, nothing else can happen
    // except the priority holder adding a faster response or passing.
    chain: state.chain.length
      ? {
          priorityPlayer: state.priorityPlayer,
          links: state.chain.map((l) => ({ controllerIndex: l.controllerIndex, instanceId: l.sourceInstanceId, cardName: l.cardName, speed: l.speed, kind: l.kind || 'effect', targetInstanceId: l.targetInstanceId || null })),
        }
      : null,
    // An automatic trigger waiting on this viewer's pick — a search (Avispa de Obsidiana, Nido de
    // Avispas...) or where to place a self-summon (Avispa Mutante, kind 'slot'). Null for the
    // other player, who has nothing to do about it.
    pendingTriggerChoice: describePendingTriggerChoice(state, viewerIndex),
  };
}

function describePendingTriggerChoice(state, viewerIndex) {
  const pending = state.pendingTriggerChoices && state.pendingTriggerChoices[0];
  if (!pending || pending.controllerIndex !== viewerIndex) return null;
  if (pending.kind === 'slot') {
    return {
      kind: 'slot',
      zone: pending.zone,
      slots: pending.slots,
      card: describeInstance(state, pending.sourceInstanceId, viewerIndex, true),
      prompt: pending.prompt || 'Se invoca de forma especial: elige dónde',
    };
  }
  if (pending.kind === 'discard') {
    return { kind: 'discard', count: pending.count, options: describeHand(state, viewerIndex), prompt: pending.prompt };
  }
  return { kind: 'effect', options: pending.options, prompt: pending.prompt };
}

// The card's own summon_rule effect (its "método de invocación especial"), if it has one the
// PLAYER chooses to use — a rule with its own `trigger` (Avispa Mutante's "si es añadida a tu
// Mano...") fires automatically instead (see summon.js fireHandTrigger) and isn't a button here.
function specialSummonRuleFor(card) {
  return (card.effectCodes || []).map(getEffect).find((e) => e && e.type === 'summon_rule' && !e.trigger && (e.actions || []).some((a) => a.fn === 'specialSummon'));
}

// Whether that rule's CONDITIONS are met right now (cost affordability isn't checked here — the
// player finds out when they try, same as any other cost).
function specialSummonAvailable(state, ownerIndex, instanceId, card) {
  const rule = specialSummonRuleFor(card);
  if (!rule) return false;
  const ctx = { state, controllerIndex: ownerIndex, sourceInstanceId: instanceId, effect: rule };
  return checkConditions(ctx, rule.conditions);
}

function describeInstance(state, instanceId, ownerIndex, isViewerOwner) {
  const cardId = instanceId.split(':')[1];
  const card = getCard(cardId);
  const base = { instanceId, cardId, name: card.name, image: card.image, category: card.category, subtype: card.subtype };
  if (card.category === 'monster') {
    base.normalSummonable = canBeNormalSummoned(card);
    base.cannotBeSummoned = cannotBeSummoned(card);
    base.specialSummonAvailable = isViewerOwner && specialSummonAvailable(state, ownerIndex, instanceId, card);
  }
  if (!isViewerOwner) return base;
  return { ...base, availableEffects: computeAvailableEffects(state, ownerIndex, instanceId, cardId) };
}

function describeFieldMonster(state, m, ownerIndex, isViewerOwner) {
  const base = {
    instanceId: m.instanceId,
    position: m.position,
    faceDown: m.faceDown,
    hasAttacked: m.hasAttacked,
    counters: m.counters,
    statuses: statusesOf(state, m.instanceId),
    materialCount: (m.materials || []).length,
    // Only a compiled monster from an earlier turn can be decompiled from the UI (Pez dorado's
    // same-turn exception is left to the server to accept or reject).
    canDecompile: (m.materials || []).length > 0,
    // Whether its owner can attack the rival's VP with it right now — the board offers the rival's
    // VP as a target only then (empty board, only untargetable monsters, or "puede atacar directamente").
    canAttackDirectly: isViewerOwner && !attackBlockReason(state, ownerIndex, m, null),
  };
  if (m.isToken) return { ...base, isToken: true, name: m.tokenDef.name, atk: m.baseAtk, def: m.baseDef };
  // The owner knows which card their face-down monster is (for the hover preview); the rival doesn't.
  if (m.faceDown) return isViewerOwner ? { ...base, cardId: m.cardId, availableEffects: [] } : base;
  const card = getCard(m.cardId);
  const buff = m.tempBuff || { atk: 0, def: 0 };
  const described = { ...base, cardId: m.cardId, name: card.name, image: card.image, atk: card.atk + buff.atk, def: card.def + buff.def };
  if (!isViewerOwner) return described;
  return { ...described, availableEffects: computeAvailableEffects(state, ownerIndex, m.instanceId, m.cardId) };
}

function describeFieldSupport(state, s, ownerIndex, isViewerOwner) {
  if (s.faceDown && !isViewerOwner) return { instanceId: s.instanceId, faceDown: true };
  const card = getCard(s.cardId);
  const described = { instanceId: s.instanceId, faceDown: s.faceDown, cardId: s.cardId, name: card.name, image: card.image, subtype: card.subtype };
  if (!isViewerOwner) return described;
  return { ...described, availableEffects: computeAvailableEffects(state, ownerIndex, s.instanceId, s.cardId) };
}

module.exports = { createMatch, applyAction, viewFor, coinTossFirstPlayer };
