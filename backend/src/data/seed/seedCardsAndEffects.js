// Loads the card database + effect rules into MongoDB. Safe to re-run: cards are upserted by
// `name` (unique per card). `number` — the stable unique identifier — is preserved for existing
// cards and freshly assigned only to new ones, regardless of row order in the source spreadsheet.
// Effects are upserted by `_id`.
//
// Usage:
//   node src/data/seed/seedCardsAndEffects.js
//
// Reads MONGO_URL from .env same as the rest of the app. Run with NODE_ENV=test to seed a
// throwaway in-memory database instead (useful for a dry run).

require('dotenv').config();
const path = require('path');
const { connectDB, disconnectDB } = require('../../mongo/connection');
const { Card, DEFAULT_STATE_BY_RARITY } = require('../Schema/card');
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
  // `number` is the stable unique identifier — never trust whatever the spreadsheet export put
  // there (row order shifts every time someone edits the sheet). Reuse each existing card's own
  // number by name; only brand-new names get the next free number, in file order.
  const existingNumbersByName = new Map(
    (await Card.find({}, 'name number').lean()).map((c) => [c.name, c.number]),
  );
  let nextNumber = existingNumbersByName.size
    ? Math.max(...existingNumbersByName.values()) + 1
    : 1;

  for (const card of cards) {
    const isNewCard = !existingNumbersByName.has(card.name);
    const stableNumber = isNewCard ? nextNumber++ : existingNumbersByName.get(card.name);
    const payload = { ...card, number: stableNumber };

    // `state` (the banlist value) only gets a rarity-based default for brand-new cards. An
    // existing card's `state` is left out of the payload entirely so a manual banlist edit
    // (ban/limit) in the database survives re-running this script.
    if (isNewCard) {
      payload.state = DEFAULT_STATE_BY_RARITY[card.rarity] ?? 3;
    }

    // eslint-disable-next-line no-await-in-loop
    await Card.findOneAndUpdate({ name: card.name }, payload, {
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
