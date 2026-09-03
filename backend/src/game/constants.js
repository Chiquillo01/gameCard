// Values sourced from Rulebook.pdf, confirmed with the designer.
// NOTE: card ATK/Vida(DEF) values in the current seed data run up to 230, well above this 80
// starting VP — the designer confirmed those numbers are outdated and due for a rebalance
// alongside the DEF -> "Vida" rename, so matches can look lopsided until the card data catches up.
const STARTING_VP = 80;
const STARTING_HAND_SIZE = 6;
const MONSTER_ZONES = 5;
const SUPPORT_ZONES = 4; // Territorio (Reino) is a separate 5th zone, not part of this
const MAX_HAND_SIZE = 8; // book contradicts itself (7 to exile vs 8 to graveyard) — using the more detailed rule (Fase Final: discard to 8, to graveyard)

const STARTING_PIXELS = 6;
const PIXEL_INCOME_PER_TURN = 6;
const PIXEL_CAP = 18;

const PHASES = ['draw', 'standby', 'main1', 'battle', 'main2', 'end'];

const EFFECT_TYPES = {
  KEYWORD: 'keyword',
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
  STARTING_VP,
  STARTING_HAND_SIZE,
  MONSTER_ZONES,
  SUPPORT_ZONES,
  MAX_HAND_SIZE,
  STARTING_PIXELS,
  PIXEL_INCOME_PER_TURN,
  PIXEL_CAP,
  PHASES,
  EFFECT_TYPES,
};
