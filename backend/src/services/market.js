// The card market: players sell their spare copies to each other for pixelcoins.
//
// - Only spare copies can be listed: a player always keeps at least one copy of a card, and never
//   fewer than the most any of their decks uses, so selling never breaks a deck.
// - Listed copies leave the seller's collection straight away (the listing holds them); a
//   withdrawn listing gives back whatever wasn't sold.
// - A purchase reserves the copies, charges the buyer, hands the cards over and pays the seller —
//   each step an atomic update, undone if a later one fails, so nothing is ever paid for twice,
//   sold twice or lost.
const { Market } = require('../data/Schema/market');
const { Card } = require('../data/Schema/card');
const { User } = require('../data/Schema/user');
const { Deck } = require('../data/Schema/deck');
const { UserCollection } = require('../data/Schema/userCollection');
const { addCardsToCollection, charge, refund } = require('./storeRewards');

const MAX_PRICE = 1000000;
const MAX_LISTING_COPIES = 99;

class MarketError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const sameId = (a, b) => String(a) === String(b);

// How many copies of each card the player's decks use at most: { [cardId]: copies }.
async function copiesInDecks(userId) {
  const decks = await Deck.find({ owner: userId }).select('cards fusionCards').lean();
  const most = {};
  decks.forEach((deck) => {
    const perDeck = {};
    [...(deck.cards || []), ...(deck.fusionCards || [])].forEach(({ card, amount }) => {
      const key = String(card);
      perDeck[key] = (perDeck[key] || 0) + amount;
    });
    Object.entries(perDeck).forEach(([key, n]) => { most[key] = Math.max(most[key] || 0, n); });
  });
  return most;
}

// The copies a player must keep of a card: one, or what their biggest deck use of it needs.
const copiesToKeep = (inDecks, cardId) => Math.max(1, inDecks[String(cardId)] || 0);

// Every card the player could list right now: [{ card, owned, inDecks, sellable }].
async function sellableCards(userId) {
  const [collection, inDecks] = await Promise.all([
    UserCollection.findOne({ userId }).populate('cards.cardId').lean(),
    copiesInDecks(userId),
  ]);
  if (!collection) return [];
  return collection.cards
    .filter((entry) => entry.cardId)
    .map((entry) => {
      const keep = copiesToKeep(inDecks, entry.cardId._id);
      return { card: entry.cardId, owned: entry.amount, inDecks: inDecks[String(entry.cardId._id)] || 0, sellable: Math.max(0, entry.amount - keep) };
    })
    .filter((row) => row.sellable > 0)
    .sort((a, b) => a.card.name.localeCompare(b.card.name));
}

const positiveInt = (value, max) => {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= max ? n : null;
};

async function createListing(userId, { cardId, amount, price }) {
  const copies = positiveInt(amount, MAX_LISTING_COPIES);
  if (!copies) throw new MarketError(400, 'La cantidad tiene que ser un número entero de copias.');
  const unitPrice = positiveInt(price, MAX_PRICE);
  if (!unitPrice) throw new MarketError(400, 'El precio tiene que ser un número entero de pixelcoins (mínimo 1).');
  const card = await Card.findById(cardId).select('name');
  if (!card) throw new MarketError(404, 'Carta no encontrada.');

  const keep = copiesToKeep(await copiesInDecks(userId), cardId);
  // Takes the copies only if the player still has them to spare, in one atomic update.
  const taken = await UserCollection.updateOne(
    { userId, cards: { $elemMatch: { cardId, amount: { $gte: copies + keep } } } },
    { $inc: { 'cards.$.amount': -copies } },
  );
  if (taken.modifiedCount !== 1) {
    throw new MarketError(400, keep > 1 ? `Solo puedes vender copias repetidas: te quedas al menos con ${keep}, las que usan tus mazos.` : 'Solo puedes vender copias repetidas: siempre te quedas con una.');
  }
  try {
    return await Market.create({ cardId, userId, price: { pixelcoins: unitPrice }, amount: copies, initialAmount: copies });
  } catch (e) {
    await addCardsToCollection(userId, Array(copies).fill({ cardId }));
    throw e;
  }
}

async function withdrawListing(userId, listingId) {
  const listing = await Market.findById(listingId);
  if (!listing) throw new MarketError(404, 'Esa oferta no existe.');
  if (!sameId(listing.userId, userId)) throw new MarketError(403, 'Solo puedes retirar tus propias ofertas.');
  // Closing it and reading how many copies were left is one step, so a purchase can't slip in between.
  const closed = await Market.findOneAndUpdate({ _id: listingId, status: 'activo' }, { status: 'retirado' }, { new: false });
  if (!closed) throw new MarketError(409, 'Esa oferta ya no está activa.');
  if (closed.amount > 0) await addCardsToCollection(userId, Array(closed.amount).fill({ cardId: closed.cardId }));
  return { returned: closed.amount };
}

// Puts back copies a failed purchase had reserved: on the listing if it's still for sale, or
// straight to the seller if it was withdrawn in the meantime.
async function releaseCopies(listing, copies) {
  const back = await Market.updateOne({ _id: listing._id, status: { $in: ['activo', 'vendido'] } }, { $inc: { amount: copies }, $set: { status: 'activo' } });
  if (back.modifiedCount !== 1) await addCardsToCollection(listing.userId, Array(copies).fill({ cardId: listing.cardId }));
}

async function buyListing(buyerId, listingId, amount = 1) {
  const copies = positiveInt(amount, MAX_LISTING_COPIES);
  if (!copies) throw new MarketError(400, 'La cantidad tiene que ser un número entero de copias.');
  const listing = await Market.findById(listingId);
  if (!listing || listing.status !== 'activo') throw new MarketError(404, 'Esa oferta ya no está a la venta.');
  if (sameId(listing.userId, buyerId)) throw new MarketError(400, 'No puedes comprar tus propias cartas.');
  const cost = listing.price.pixelcoins * copies;
  const buyer = await User.findById(buyerId).select('pixelcoins');
  if (!buyer) throw new MarketError(404, 'Usuario no encontrado.');
  if (buyer.pixelcoins < cost) throw new MarketError(410, 'No tienes pixelcoins suficientes.');

  // 1. Reserve the copies (only if they're still there).
  const reserved = await Market.findOneAndUpdate(
    { _id: listingId, status: 'activo', amount: { $gte: copies } },
    { $inc: { amount: -copies } },
    { new: true },
  );
  if (!reserved) throw new MarketError(409, 'Ya no quedan tantas copias a la venta.');

  // 2. Charge the buyer.
  const charged = await charge(buyerId, 'pixelcoins', cost);
  if (!charged) {
    await releaseCopies(reserved, copies);
    throw new MarketError(410, 'No tienes pixelcoins suficientes.');
  }

  // 3. Hand the cards over.
  try {
    await addCardsToCollection(buyerId, Array(copies).fill({ cardId: listing.cardId }));
  } catch (e) {
    await refund(buyerId, 'pixelcoins', cost);
    await releaseCopies(reserved, copies);
    throw e;
  }

  // 4. Pay the seller, record the sale, close the listing once it's empty.
  await User.updateOne({ _id: listing.userId }, { $inc: { pixelcoins: cost } });
  await Market.updateOne({ _id: listingId }, { $push: { sales: { buyerId, amount: copies, unitPrice: listing.price.pixelcoins } } });
  await Market.updateOne({ _id: listingId, amount: 0, status: 'activo' }, { status: 'vendido' });

  return { bought: copies, cost, newBalance: { pixelcoins: charged.pixelcoins, pixelgems: charged.pixelgems } };
}

const SELLER_FIELDS = 'userName';
const CARD_FIELDS = 'name image rarity category expansion attribute atk def level effect family type invocationText';

// Active listings, cheapest first — all of them, or one card's.
function activeListings(cardId) {
  const query = { status: 'activo', amount: { $gt: 0 } };
  if (cardId) query.cardId = cardId;
  return Market.find(query).sort({ 'price.pixelcoins': 1, createdAt: 1 }).populate('userId', SELLER_FIELDS).populate('cardId', CARD_FIELDS).lean();
}

// One row per card on sale: how many copies in total and the cheapest price.
async function marketSummary() {
  const listings = await activeListings();
  const byCard = new Map();
  listings.forEach((l) => {
    if (!l.cardId) return;
    const key = String(l.cardId._id);
    const row = byCard.get(key) || { card: l.cardId, copies: 0, listings: 0, minPrice: Infinity };
    row.copies += l.amount;
    row.listings += 1;
    row.minPrice = Math.min(row.minPrice, l.price.pixelcoins);
    byCard.set(key, row);
  });
  return [...byCard.values()].sort((a, b) => a.card.name.localeCompare(b.card.name));
}

function myListings(userId) {
  return Market.find({ userId }).sort({ createdAt: -1 }).populate('cardId', CARD_FIELDS).populate('sales.buyerId', SELLER_FIELDS).lean();
}

module.exports = { MarketError, sellableCards, createListing, withdrawListing, buyListing, activeListings, marketSummary, myListings, copiesInDecks, MAX_PRICE };
