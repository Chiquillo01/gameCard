// Loads the card database + effect rules produced from "Cartas a BBDD New.xlsx" (170 cards,
// 234 effect definitions) into MongoDB. Safe to re-run: cards are upserted by `number`,
// effects by `_id`.
//
// Usage:
//   node src/data/seed/seedCardsAndEffects.js
//
// Reads MONGO_URL from .env same as the rest of the app. Run with NODE_ENV=test to seed a
// throwaway in-memory database instead (useful for a dry run).

require('dotenv').config();
const path = require('path');
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

  console.log(`Seeding ${cards.length} cards...`);
  for (const card of cards) {
    // eslint-disable-next-line no-await-in-loop
    await Card.findOneAndUpdate({ number: card.number, name: card.name }, card, {
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
