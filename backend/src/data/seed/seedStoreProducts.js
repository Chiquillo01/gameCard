// Loads the store catalog (chests, special editions, structure decks, pixelgem packs) into
// MongoDB. Safe to re-run: products are upserted by `name`.
//
// Usage:
//   node src/data/seed/seedStoreProducts.js
//
// Reads MONGO_URL from .env same as the rest of the app. Run with NODE_ENV=test to seed a
// throwaway in-memory database instead (useful for a dry run).

require('dotenv').config();
const { connectDB, disconnectDB } = require('../../mongo/connection');
const { StoreProduct } = require('../Schema/storeProducts');

const products = require('./store_products_final.json');

async function seed() {
  await connectDB();

  console.log(`Seeding ${products.length} store products...`);
  for (const product of products) {
    // eslint-disable-next-line no-await-in-loop
    await StoreProduct.findOneAndUpdate({ name: product.name }, product, {
      upsert: true,
      setDefaultsOnInsert: true,
    });
  }

  const count = await StoreProduct.countDocuments();
  console.log(`Done. StoreProduct collection now has ${count} documents.`);

  await disconnectDB();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
