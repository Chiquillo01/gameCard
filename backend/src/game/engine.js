const { createMatchState } = require('./state');
const { advancePhase, runPhaseEntry } = require('./turns');
const { normalSummon, compileSummon, decompile } = require('./summon');
const { canBeNormalSummoned, cannotBeSummoned } = require('./summonRules');
const { hasStatus, statusesOf, FREEZE } = require('./statuses');
const { activateSupport, activateSetSupport } = require('./support');
const { declareAttack } = require('./combat');
const { changePosition } = require('./position');
const { activateEffect, requiredZoneFor, locationIsInZone } = require('./effectEngine');
const { getCard, getEffect, loadCardIndex } = require('./cardIndex');
const { player, opponentIndex, findInstanceLocation } = require('./zones');

// Player-initiated effect types (as opposed to 'triggered'/'trigger', which fire automatically,
// 'continuous', which is passive, and 'keyword'/'summon_rule'/'rule', which are static).
const PLAYER_ACTIVATABLE_TYPES = ['activated', 'quick', 'ignition'];

// Effect ids this card instance can send as ACTIVATE_EFFECT right now, from its owner's point of
// view — computed server-side so the client never has to know the effect catalog itself, just
// which buttons to show.
function computeAvailableEffects(state, ownerIndex, instanceId, cardId) {
  const card = getCard(cardId);
  const loc = findInstanceLocation(state, instanceId);
  if (!loc || loc.ownerIndex !== ownerIndex) return [];
  if (hasStatus(state, instanceId, FREEZE)) return [];
  // A face-down Normal/Continuo/Equipo support is activated by turning it over (ACTIVATE_SET_SUPPORT),
  // which pays its cost; only Veloz/Contraataque cards act through their own effects while set.
  if (loc.zone === 'field:support') {
    const entry = state.players[loc.ownerIndex].field.support[loc.slot];
    if (entry && entry.faceDown && card.subtype !== 'instant' && card.subtype !== 'counter') return [];
  }
  return (card.effectCodes || []).filter((effectId) => {
    const effect = getEffect(effectId);
    if (!effect || !PLAYER_ACTIVATABLE_TYPES.includes(effect.type)) return false;
    // Effects that don't say which zone they need (most monster ignition/quick abilities)
    // default to "must be face-up on the field" — the ordinary case for that kind of ability.
    const requiredZone = requiredZoneFor(effect) || 'field';
    return locationIsInZone(loc, requiredZone);
  });
}

async function createMatch(opts) {
  await loadCardIndex();
  const state = createMatchState(opts);
  runPhaseEntry(state); // processes turn 1's draw phase (no draw/income, per the rulebook) and marks it played
  return state;
}

// Single entry point for every player-initiated change. `action.type` selects the handler;
// returns { ok, reason?, state } — callers (socket/REST layer) broadcast `state` on success.
function applyAction(state, playerIndex, action) {
  if (state.status !== 'active') return { ok: false, reason: 'match-finished' };
  if (action.type !== 'SURRENDER' && playerIndex !== state.turnPlayer && !['ACTIVATE_EFFECT'].includes(action.type)) {
    return { ok: false, reason: 'not-your-turn' };
  }

  switch (action.type) {
    case 'ADVANCE_PHASE':
      return advancePhase(state);

    case 'NORMAL_SUMMON':
      return normalSummon(state, playerIndex, action.instanceId, {
        position: action.position || 'attack',
        faceDown: !!action.faceDown,
      });

    case 'ACTIVATE_SUPPORT':
      return activateSupport(state, playerIndex, action.instanceId, {
        targets: action.targets || [],
        setFaceDown: !!action.setFaceDown,
      });

    case 'ACTIVATE_SET_SUPPORT':
      return activateSetSupport(state, playerIndex, action.instanceId, { targets: action.targets || [] });

    case 'COMPILE_SUMMON':
      return compileSummon(state, playerIndex, action.instanceId, action.materialInstanceIds || []);

    case 'DECLARE_ATTACK':
      return declareAttack(state, playerIndex, action.attackerInstanceId, action.targetInstanceId || null);

    case 'DECOMPILE':
      return decompile(state, playerIndex, action.instanceId);

    case 'CHANGE_POSITION':
      return changePosition(state, playerIndex, action.instanceId, action.position);

    case 'ACTIVATE_EFFECT':
      return activateEffect(state, playerIndex, action.effectId, action.sourceInstanceId, action.targets || []);

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
  };
}

function describeInstance(state, instanceId, ownerIndex, isViewerOwner) {
  const cardId = instanceId.split(':')[1];
  const card = getCard(cardId);
  const base = { instanceId, cardId, name: card.name, image: card.image, category: card.category, subtype: card.subtype };
  if (card.category === 'monster') {
    base.normalSummonable = canBeNormalSummoned(card);
    base.cannotBeSummoned = cannotBeSummoned(card);
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

module.exports = { createMatch, applyAction, viewFor };
