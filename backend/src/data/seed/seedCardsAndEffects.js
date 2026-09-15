// Loads the card database + effect rules into MongoDB. Safe to re-run: cards are upserted by
// `name` (unique per card). Effects are upserted by `_id`.
//
// `number` (stable unique id) and `state` (banlist value) both come straight from
// cards_final.json now — the source spreadsheet is the human-curated authority for both, so the
// seed script just trusts it instead of re-deriving or preserving them itself.
//
// Usage:
//   node src/data/seed/seedCardsAndEffects.js
//
// Reads MONGO_URL from .env same as the rest of the app. Run with NODE_ENV=test to seed a
// throwaway in-memory database instead (useful for a dry run).

require('dotenv').config();
const { connectDB, disconnectDB } = require('../../mongo/connection');
const { Card } = require('../Schema/card');
const { Effect } = require('../Schema/effect');

const cards = require('./cards_final.json');
const effects = require('./effects_final.json');

async function seed() {
  await connectDB();

  console.log(`Seeding ${effects.length} effects...`);
  await Promise.all(
    effects.map((e) => Effect.findByIdAndUpdate(e._id, e, { upsert: true, setDefaultsOnInsert: true })),
  );

  const numbers = cards.map((c) => c.number);
  if (new Set(numbers).size !== numbers.length) {
    throw new Error('cards_final.json has duplicate `number` values — fix the source spreadsheet.');
  }

  console.log(`Seeding ${cards.length} cards...`);
  for (const card of cards) {
    // eslint-disable-next-line no-await-in-loop
    await Card.findOneAndUpdate({ name: card.name }, card, {
      upsert: true,
      setDefaultsOnInsert: true,
    });
  }

  const cardCount = await Card.countDocuments();
  const effectCount = await Effect.countDocuments();
  console.log(`Done. Card collection now has ${cardCount} documents, Effect collection has ${effectCount}.`);

  await disconnectDB();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
