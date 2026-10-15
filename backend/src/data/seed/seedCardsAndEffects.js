// Loads the card database + effect rules into MongoDB. Safe to re-run: cards are upserted by
// `number` (the stable id from the spreadsheet), so renaming a card in the sheet updates it in
// place instead of creating a duplicate. Effects are upserted by `_id`.
//
// `number` (stable unique id) and `state` (banlist value) both come straight from
// cards_final.json now — the source spreadsheet is the human-curated authority for both, so the
// seed script just trusts it instead of re-deriving or preserving them itself.
//
// Usage:
//   node src/data/seed/seedCardsAndEffects.js [--prune]
//
// Cards renumbered in the sheet keep their document (matched by name, see renumberByName);
// --prune also deletes the cards that are no longer in cards_final.json.
//
// Reads MONGO_URL from .env same as the rest of the app. Run with NODE_ENV=test to seed a
// throwaway in-memory database instead (useful for a dry run).

require('dotenv').config();
const { connectDB, disconnectDB } = require('../../mongo/connection');
const { Card } = require('../Schema/card');
const { Effect } = require('../Schema/effect');

const cards = require('./cards_final.json');
const effects = require('./effects_final.json');
const gameRules = require('./game_rules_final.json');
const renames = require('./card_renames_final.json');
const { GameRules } = require('../Schema/gameRules');
const { Deck } = require('../Schema/deck');
const { UserCollection } = require('../Schema/userCollection');
const { Market } = require('../Schema/market');

const PRUNE = process.argv.includes('--prune');

// The JSON entry as the schema would store it (defaults filled in), without the generated _id —
// replaceOne keeps a card's existing _id, which decks and collections point at.
function withDefaults(Model, data) {
  const doc = new Model(data).toObject();
  if (!('_id' in data)) delete doc._id;
  delete doc.createdAt;
  delete doc.updatedAt;
  return doc;
}

// The sheet can renumber cards. Before upserting by `number`, every existing card document moves to
// the number its name (or a former name, card_renames_final.json) has now, keeping its _id — decks
// and collections point at it. A document whose card is no longer in the file is parked on a
// negative number so it can't be overwritten by a new card; with --prune it is deleted instead,
// together with its copies in collections, decks and the Market.
async function renumberByName(cards, renames, { prune = false } = {}) {
  const target = new Map(cards.map((c) => [c.name, c.number]));
  Object.entries(renames).forEach(([now, before]) => before.forEach((old) => {
    if (!target.has(old)) target.set(old, target.get(now));
  }));
  const docs = await Card.find({}, { name: 1, number: 1 }).lean();
  const kept = docs.filter((d) => target.has(d.name));
  const gone = docs.filter((d) => !target.has(d.name));
  const moving = kept.filter((d) => d.number !== target.get(d.name));
  const parking = gone.filter((d) => d.number > 0);
  if (moving.length || parking.length) {
    // Two steps through negative numbers, so no two documents ever share one (it's unique).
    await Card.bulkWrite([...moving, ...parking].map((d, i) => ({ updateOne: { filter: { _id: d._id }, update: { $set: { number: -1 - i } } } })));
    await Card.bulkWrite(moving.map((d) => ({ updateOne: { filter: { _id: d._id }, update: { $set: { number: target.get(d.name) } } } })));
    if (moving.length) console.log(`Renumbered ${moving.length} card(s).`);
  }
  if (!gone.length) return;
  if (!prune) {
    console.log(`${gone.length} card(s) no longer in cards_final.json, kept aside (run with --prune to delete them): ${gone.map((d) => d.name).join(', ')}`);
    return;
  }
  const ids = gone.map((d) => d._id);
  await UserCollection.updateMany({}, { $pull: { cards: { cardId: { $in: ids } } } });
  await Deck.updateMany({}, { $pull: { cards: { card: { $in: ids } }, fusionCards: { card: { $in: ids } }, tokens: { $in: ids } } });
  await Market.deleteMany({ cardId: { $in: ids } });
  await Card.deleteMany({ _id: { $in: ids } });
  console.log(`Deleted ${gone.length} card(s) no longer in cards_final.json: ${gone.map((d) => d.name).join(', ')}`);
}

async function seed() {
  await connectDB();

  // Each document is REPLACED with what the JSON says (plus the schema defaults), not merged into:
  // a field removed from the JSON (an old cost, a dropped filter) must go from the database too,
  // or the engine keeps running the old rule.
  console.log(`Seeding ${effects.length} effects...`);
  await Promise.all(effects.map((e) => Effect.replaceOne({ _id: e._id }, withDefaults(Effect, e), { upsert: true })));
  // effects_final.json is the whole catalog: an effect removed from it (the old keywords) goes
  // from the database too, instead of lingering for cards that still reference it.
  const pruned = await Effect.deleteMany({ _id: { $nin: effects.map((e) => e._id) } });
  if (pruned.deletedCount) console.log(`Removed ${pruned.deletedCount} effect(s) no longer in effects_final.json.`);

  const numbers = cards.map((c) => c.number);
  if (new Set(numbers).size !== numbers.length) {
    throw new Error('cards_final.json has duplicate `number` values — fix the source spreadsheet.');
  }

  await renumberByName(cards, renames, { prune: PRUNE });

  console.log(`Seeding ${cards.length} cards...`);
  for (const card of cards) {
    // eslint-disable-next-line no-await-in-loop
    await Card.replaceOne({ number: card.number }, withDefaults(Card, card), { upsert: true });
  }

  console.log('Seeding game rules...');
  await GameRules.replaceOne({ _id: 'rules' }, { _id: 'rules', ...gameRules }, { upsert: true });

  const cardCount = await Card.countDocuments();
  const effectCount = await Effect.countDocuments();
  console.log(`Done. Card collection now has ${cardCount} documents, Effect collection has ${effectCount}.`);

  await disconnectDB();
}

if (require.main === module) {
  seed().catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
}

module.exports = { renumberByName };
