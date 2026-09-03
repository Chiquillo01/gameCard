const { buildInstances } = require('./deckUtils');
const { STARTING_VP, STARTING_HAND_SIZE, STARTING_PIXELS, MONSTER_ZONES, SUPPORT_ZONES } = require('./constants');

function makePlayer(userId, deckDoc, ownerIndex) {
  const { deck, extra } = buildInstances(deckDoc, ownerIndex);
  const hand = deck.splice(0, STARTING_HAND_SIZE);
  return {
    userId: userId.toString(),
    vp: STARTING_VP,
    pixelcoins: STARTING_PIXELS,
    normalSummonUsed: false,
    turnsPlayed: 0, // rulebook: no automatic +6 pixel income on a player's own first turn
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

function createMatchState({ matchId, playerA, deckA, playerB, deckB, vsBot = false }) {
  return {
    id: matchId,
    status: 'active',
    vsBot,
    turnNumber: 1,
    turnPlayer: 0,
    phase: 'draw', // still goes through draw/standby on turn 1 — only the draw itself is skipped
    firstTurn: true,
    priorityPlayer: 0,
    chain: [],
    pendingActivation: null, // { effectId, sourceInstanceId, controllerIndex } awaiting target selection
    winnerIndex: null,
    log: [],
    players: [makePlayer(playerA, deckA, 0), makePlayer(playerB, deckB, 1)],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

module.exports = { createMatchState };
