const { buildInstances } = require('./deckUtils');
const { MONSTER_ZONES, SUPPORT_ZONES } = require('./constants');
const { rules } = require('./rules');

function makePlayer(userId, deckDoc, ownerIndex, name = null) {
  const { deck, extra } = buildInstances(deckDoc, ownerIndex);
  const hand = deck.splice(0, rules().startingHandSize);
  return {
    userId: userId.toString(),
    name, // shown on the board and in the log instead of the id
    vp: rules().startingVp,
    pixelcoins: rules().startingPixels,
    normalSummonUsed: false,
    turnsPlayed: 0, // rulebook: no automatic pixel income on a player's own first turn
    hand,
    deck,
    extra,
    graveyard: [],
    banished: [],
    field: {
      monsters: new Array(MONSTER_ZONES).fill(null),
      support: new Array(SUPPORT_ZONES).fill(null),
      territory: null, // Territorio/Reino is its own zone, separate from the general support zone
    },
  };
}

// `firstPlayer`: who takes turn 1 (0 = playerA) — decided by the coin toss the duel controller does.
function createMatchState({ matchId, playerA, deckA, playerB, deckB, vsBot = false, firstPlayer = 0, nameA = null, nameB = null }) {
  return {
    id: matchId,
    status: 'active',
    vsBot,
    turnNumber: 1,
    turnPlayer: firstPlayer,
    phase: 'draw', // still goes through draw/standby on turn 1 — only the draw itself is skipped
    firstTurn: true,
    priorityPlayer: firstPlayer,
    chain: [],
    pendingActivation: null, // { effectId, sourceInstanceId, controllerIndex } awaiting target selection
    // Automatic triggers with an ambiguous search (more than one legal card) wait here for the
    // player's pick instead of grabbing one at random — see effectEngine.fireTrigger.
    pendingTriggerChoices: [],
    winnerIndex: null,
    log: [],
    players: [makePlayer(playerA, deckA, 0, nameA), makePlayer(playerB, deckB, 1, nameB)],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

module.exports = { createMatchState };
