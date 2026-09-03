const { MatchResult } = require('../data/Schema/matchResult');

const matches = new Map(); // matchId -> state
const userToMatch = new Map(); // userId -> matchId
const pendingChallenges = new Map(); // matchId -> { challengerId, challengerDeckId, opponentId }

function savePending(pending) {
  pendingChallenges.set(pending.matchId, pending);
}

function getPending(matchId) {
  return pendingChallenges.get(matchId) || null;
}

function removePending(matchId) {
  pendingChallenges.delete(matchId);
}

function save(state) {
  state.updatedAt = Date.now();
  matches.set(state.id, state);
  state.players.forEach((p) => userToMatch.set(p.userId, state.id));
  if (state.status === 'finished') {
    MatchResult.create({
      players: state.players.map((p) => ({ userId: p.userId, isBot: p.userId === 'BOT' })),
      winnerIndex: state.winnerIndex,
      turnCount: state.turnNumber,
      vsBot: state.vsBot,
    }).catch(() => {});
    setTimeout(() => {
      matches.delete(state.id);
      state.players.forEach((p) => userToMatch.delete(p.userId));
    }, 10 * 60 * 1000); // keep finished matches around briefly so both clients can fetch final state
  }
  return state;
}

function get(matchId) {
  return matches.get(matchId) || null;
}

function getForUser(userId) {
  const matchId = userToMatch.get(userId.toString());
  return matchId ? matches.get(matchId) : null;
}

function remove(matchId) {
  const state = matches.get(matchId);
  if (state) state.players.forEach((p) => userToMatch.delete(p.userId));
  matches.delete(matchId);
}

module.exports = { save, get, getForUser, remove, savePending, getPending, removePending };
