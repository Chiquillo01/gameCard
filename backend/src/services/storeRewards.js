// What a store purchase hands out, and charging for it.
//
// A chest's contents come from its own `dropTable` in the database — how many cards each slot
// gives and the odds of each rarity — and are drawn only from the cards that really exist in its
// expansion. Nothing about the draw is fixed in code.
const { Card } = require('../data/Schema/card');
const { User } = require('../data/Schema/user');
const { UserCollection } = require('../data/Schema/userCollection');

const RARITIES = ['common', 'rare', 'epic', 'legendary'];

const dropTableSize = (dropTable = []) => dropTable.reduce((sum, slot) => sum + (slot.count || 0), 0);

// Picks a rarity by weight among those the expansion actually has cards of. If none of the slot's
// rarities has any, the nearest one that does (lower first, then higher) — so a chest from an
// expansion without, say, rare cards still gives a full set.
function rollRarity(odds, available, random) {
  const weighted = Object.entries(odds || {}).filter(([rarity, weight]) => weight > 0 && available.has(rarity));
  if (weighted.length) {
    const total = weighted.reduce((sum, [, weight]) => sum + weight, 0);
    let roll = random() * total;
    for (const [rarity, weight] of weighted) {
      roll -= weight;
      if (roll < 0) return rarity;
    }
    return weighted[weighted.length - 1][0];
  }
  const wanted = Object.entries(odds || {}).filter(([, weight]) => weight > 0).map(([r]) => RARITIES.indexOf(r)).filter((i) => i >= 0);
  const target = wanted.length ? Math.min(...wanted) : 0;
  for (let step = 0; step < RARITIES.length; step++) {
    const lower = RARITIES[target - step];
    if (lower && available.has(lower)) return lower;
    const higher = RARITIES[target + step];
    if (higher && available.has(higher)) return higher;
  }
  return null;
}

// The cards one chest gives: [{ cardId, name, image, rarity }], or null when it can't be filled
// (its expansion has no cards at all, or the product has no drop table).
async function drawChest(productDoc, random = Math.random) {
  const product = productDoc.toObject ? productDoc.toObject() : productDoc;
  const size = dropTableSize(product.dropTable);
  if (!size) return null;
  const cards = await Card.find({ expansion: product.expansion }).select('name image rarity').lean();
  const byRarity = new Map();
  cards.forEach((card) => {
    if (!byRarity.has(card.rarity)) byRarity.set(card.rarity, []);
    byRarity.get(card.rarity).push(card);
  });
  const available = new Set(byRarity.keys());
  const drawn = [];
  for (const slot of product.dropTable) {
    for (let i = 0; i < slot.count; i++) {
      const rarity = rollRarity(slot.odds, available, random);
      if (!rarity) return null;
      const pool = byRarity.get(rarity);
      const card = pool[Math.floor(random() * pool.length)];
      drawn.push({ cardId: card._id, name: card.name, image: card.image, rarity });
    }
  }
  return drawn;
}

// Adds the cards (one entry per copy) to the user's collection in a single write.
async function addCardsToCollection(userId, cards) {
  let collection = await UserCollection.findOne({ userId });
  if (!collection) collection = new UserCollection({ userId, cards: [] });
  cards.forEach(({ cardId }) => {
    const existing = collection.cards.find((c) => c.cardId.toString() === cardId.toString());
    if (existing) existing.amount += 1;
    else collection.cards.push({ cardId, amount: 1 });
  });
  collection.markModified('cards');
  await collection.save();
}

// Takes `cost` of `method` only if the user still has it, in one atomic update — two purchases at
// the same time can't both spend the same coins. `credit` adds to other balances in the same step
// (a pixelgem pack). Returns the updated user, or null when they can't afford it.
async function charge(userId, method, cost, credit = {}) {
  const inc = { ...credit };
  inc[method] = (inc[method] || 0) - cost;
  return User.findOneAndUpdate({ _id: userId, [method]: { $gte: cost } }, { $inc: inc }, { new: true });
}

// Undoes a charge when what was paid for couldn't be handed out.
async function refund(userId, method, cost, credit = {}) {
  const inc = Object.fromEntries(Object.entries(credit).map(([k, v]) => [k, -v]));
  inc[method] = (inc[method] || 0) + cost;
  await User.updateOne({ _id: userId }, { $inc: inc });
}

module.exports = { drawChest, dropTableSize, rollRarity, addCardsToCollection, charge, refund, RARITIES };
