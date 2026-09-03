const { createMatchState } = require('./state');
const { advancePhase, runPhaseEntry } = require('./turns');
const { normalSummon, compileSummon } = require('./summon');
const { activateSupport } = require('./support');
const { declareAttack } = require('./combat');
const { activateEffect } = require('./effectEngine');
const { getCard, loadCardIndex } = require('./cardIndex');
const { player, opponentIndex } = require('./zones');

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

    case 'COMPILE_SUMMON':
      return compileSummon(state, playerIndex, action.instanceId, action.materialInstanceIds || []);

    case 'DECLARE_ATTACK':
      return declareAttack(state, playerIndex, action.attackerInstanceId, action.targetInstanceId || null);

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
  const redactPlayer = (pl, idx) => ({
    userId: pl.userId,
    vp: pl.vp,
    pixelcoins: pl.pixelcoins,
    normalSummonUsed: pl.normalSummonUsed,
    handCount: pl.hand.length,
    hand: idx === viewerIndex ? pl.hand.map(describeInstance) : undefined,
    deckCount: pl.deck.length,
    extraCount: pl.extra.length,
    graveyard: pl.graveyard.map(describeInstance),
    banished: pl.banished.map(describeInstance),
    field: {
      monsters: pl.field.monsters.map((m) => (m ? describeFieldMonster(m) : null)),
      support: pl.field.support.map((s) => (s ? describeFieldSupport(s, idx === viewerIndex) : null)),
      territory: pl.field.territory ? describeFieldSupport(pl.field.territory, idx === viewerIndex) : null,
    },
  });

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

function describeInstance(instanceId) {
  const cardId = instanceId.split(':')[1];
  const card = getCard(cardId);
  return { instanceId, cardId, name: card.name, image: card.image, category: card.category, subtype: card.subtype };
}

function describeFieldMonster(m) {
  const base = {
    instanceId: m.instanceId,
    position: m.position,
    faceDown: m.faceDown,
    hasAttacked: m.hasAttacked,
    counters: m.counters,
  };
  if (m.isToken) return { ...base, isToken: true, name: m.tokenDef.name, atk: m.baseAtk, def: m.baseDef };
  if (m.faceDown) return base;
  const card = getCard(m.cardId);
  const buff = m.tempBuff || { atk: 0, def: 0 };
  return { ...base, cardId: m.cardId, name: card.name, image: card.image, atk: card.atk + buff.atk, def: card.def + buff.def };
}

function describeFieldSupport(s, isOwner) {
  if (s.faceDown && !isOwner) return { instanceId: s.instanceId, faceDown: true };
  const card = getCard(s.cardId);
  return { instanceId: s.instanceId, faceDown: s.faceDown, cardId: s.cardId, name: card.name, image: card.image };
}

module.exports = { createMatch, applyAction, viewFor };
