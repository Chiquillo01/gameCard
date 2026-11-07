const { Schema, model } = require('mongoose');

// The duel's numbers (starting VP, pixels, hand and deck sizes...) as one document, seeded from
// data/seed/game_rules_final.json like the cards — so a balance change is data, not code.
const gameRulesSchema = new Schema(
  {
    _id: { type: String, default: 'rules' },
    startingVp: Number,
    startingHandSize: Number,
    startingPixels: Number,
    pixelIncomePerTurn: Number,
    pixelCap: Number,
    maxHandSize: Number,
    burnEndOfTurnDamage: Number,
    freezeBreakerAttribute: String,
    minDeckSize: Number,
    maxDeckSize: Number,
    maxFusionCards: Number,
    maxCopiesByRarity: { type: Schema.Types.Mixed },
  },
  { timestamps: true, _id: false },
);

const GameRules = model('GameRules', gameRulesSchema);

module.exports = { GameRules };
