const { MatchResult } = require('../data/Schema/matchResult');

// Matches live in memory only — fine while the game is being tested (a server restart ends every
// duel in progress). What must not happen is memory growing forever: a match nobody touches for
// ABANDONED_MATCH_MS and a challenge nobody answers within PENDING_CHALLENGE_MS are dropped by a
// periodic sweep.
const ABANDONED_MATCH_MS = 2 * 60 * 60 * 1000;
const PENDING_CHALLENGE_MS = 15 * 60 * 1000;
const FINISHED_MATCH_MS = 10 * 60 * 1000; // so both clients can still fetch the final state
const SWEEP_EVERY_MS = 5 * 60 * 1000;

const matches = new Map(); // matchId -> state
const userToMatch = new Map(); // userId -> matchId
const pendingChallenges = new Map(); // matchId -> { challengerId, challengerDeckId, opponentId, createdAt }

function savePending(pending) {
  pendingChallenges.set(pending.matchId, { ...pending, createdAt: Date.now() });
}

function getPending(matchId) {
  const pending = pendingChallenges.get(matchId);
  if (!pending) return null;
  if (Date.now() - pending.createdAt > PENDING_CHALLENGE_MS) {
    pendingChallenges.delete(matchId);
    return null;
  }
  return pending;
}

function removePending(matchId) {
  pendingChallenges.delete(matchId);
}

function save(state) {
  state.updatedAt = Date.now();
  matches.set(state.id, state);
  state.players.forEach((p) => userToMatch.set(p.userId, state.id));
  if (state.status === 'finished' && !state.resultRecorded) {
    state.resultRecorded = true;
    MatchResult.create({
      players: state.players.map((p) => ({ userId: p.userId, isBot: p.userId === 'BOT' })),
      winnerIndex: state.winnerIndex,
      turnCount: state.turnNumber,
      vsBot: state.vsBot,
    }).catch(() => {});
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
  if (state) state.players.forEach((p) => { if (userToMatch.get(p.userId) === matchId) userToMatch.delete(p.userId); });
  matches.delete(matchId);
}

// Drops finished matches after a short grace period, abandoned ones after a long one, and expired
// challenges. `now` is injectable for tests.
function sweep(now = Date.now()) {
  [...matches.values()].forEach((state) => {
    const idle = now - (state.updatedAt || 0);
    if ((state.status === 'finished' && idle > FINISHED_MATCH_MS) || idle > ABANDONED_MATCH_MS) remove(state.id);
  });
  [...pendingChallenges.entries()].forEach(([id, p]) => { if (now - p.createdAt > PENDING_CHALLENGE_MS) pendingChallenges.delete(id); });
}

// unref(): the sweep never keeps the process (or a test run) alive on its own.
setInterval(sweep, SWEEP_EVERY_MS).unref();

module.exports = { save, get, getForUser, remove, savePending, getPending, removePending, sweep, ABANDONED_MATCH_MS };
