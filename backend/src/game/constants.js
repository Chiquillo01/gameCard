// The board's shape and the turn's phases (Rulebook.pdf). The balance numbers — starting VP,
// pixels, hand and deck sizes... — are data: game/rules.js reads them from the database (seeded
// from data/seed/game_rules_final.json). The getters below keep the old names working.
const { rules } = require('./rules');

const MONSTER_ZONES = 5;
const SUPPORT_ZONES = 4; // Territorio (Reino) is a separate 5th zone, not part of this

const PHASES = ['draw', 'standby', 'main1', 'battle', 'main2', 'end'];

const EFFECT_TYPES = {
  CONTINUOUS: 'continuous',
  TRIGGERED: 'triggered',
  TRIGGER: 'trigger',
  QUICK: 'quick',
  IGNITION: 'ignition',
  SUMMON_RULE: 'summon_rule',
  RULE: 'rule',
  ACTIVATED: 'activated',
};

module.exports = {
  MONSTER_ZONES,
  SUPPORT_ZONES,
  PHASES,
  EFFECT_TYPES,
  get STARTING_VP() { return rules().startingVp; },
  get STARTING_HAND_SIZE() { return rules().startingHandSize; },
  get MAX_HAND_SIZE() { return rules().maxHandSize; },
  get STARTING_PIXELS() { return rules().startingPixels; },
  get PIXEL_INCOME_PER_TURN() { return rules().pixelIncomePerTurn; },
  get PIXEL_CAP() { return rules().pixelCap; },
  get FREEZE_BREAKER_ATTRIBUTE() { return rules().freezeBreakerAttribute; },
};
