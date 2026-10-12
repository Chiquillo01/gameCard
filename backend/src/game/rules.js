// The duel's numbers, read from the database (GameRules, seeded from game_rules_final.json) and
// kept in memory like the card index, so the engine reads them synchronously. Until the database
// answers — or if it has no rules document yet — the seed file itself is used.
const defaults = require('../data/seed/game_rules_final.json');

let current = { ...defaults };

async function loadRules() {
  try {
    const { GameRules } = require('../data/Schema/gameRules');
    const doc = await GameRules.findById('rules').lean();
    current = { ...defaults, ...(doc || {}) };
  } catch (e) {
    current = { ...defaults };
  }
  return current;
}

function rules() {
  return current;
}

// What the client needs to know (deck builder, VP bar...): every value but the bookkeeping fields.
function publicRules() {
  const { _id, __v, createdAt, updatedAt, ...values } = current;
  return values;
}

module.exports = { rules, loadRules, publicRules };
