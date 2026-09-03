const { Schema, model } = require('mongoose');

// Live match state lives in memory (backend/src/game/matchStore.js) — this schema only
// persists the outcome, for match history / stats, once a duel finishes.
const matchResultSchema = new Schema(
  {
    players: [
      {
        userId: { type: String, required: true },
        isBot: { type: Boolean, default: false },
      },
    ],
    winnerIndex: { type: Number },
    turnCount: { type: Number },
    vsBot: { type: Boolean, default: false },
    finishedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

const MatchResult = model('MatchResult', matchResultSchema);
module.exports = { MatchResult };
