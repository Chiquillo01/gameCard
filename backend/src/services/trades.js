// Card swaps between friends.
//
// - Only spare copies can be traded, the same rule as the Market: a player always keeps at least
//   one copy of a card, and never fewer than the most any of their decks uses.
// - Proposing moves nothing. When the friend accepts, both sides are checked again (collections
//   may have changed since) and the copies change hands. Each step is an atomic update, undone if
//   a later one fails, so a card is never duplicated or lost.
const mongoose = require('mongoose');
const { Trade } = require('../data/Schema/trade');
const { Card } = require('../data/Schema/card');
const { User } = require('../data/Schema/user');
const { UserCollection } = require('../data/Schema/userCollection');
const { copiesInDecks, sellableCards } = require('./market');
const { addCardsToCollection } = require('./storeRewards');
const { areFriends } = require('./friends');

const MAX_LINES = 20; // different cards per side
const MAX_COPIES = 99;

class TradeError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const sameId = (a, b) => String(a) === String(b);
const isId = (id) => mongoose.Types.ObjectId.isValid(id);

// [{ cardId, amount }] from the client -> one line per card, whole positive amounts, or a TradeError.
function cleanLines(lines, side) {
  if (lines === undefined || lines === null) return [];
  if (!Array.isArray(lines)) throw new TradeError(400, `Las cartas de "${side}" no son válidas.`);
  const byCard = new Map();
  lines.forEach((line) => {
    const amount = Number(line && line.amount);
    if (!line || !isId(line.cardId) || !Number.isInteger(amount) || amount < 1 || amount > MAX_COPIES) {
      throw new TradeError(400, `Las cartas de "${side}" no son válidas.`);
    }
    const key = String(line.cardId);
    byCard.set(key, (byCard.get(key) || 0) + amount);
  });
  if (byCard.size > MAX_LINES) throw new TradeError(400, `Como mucho ${MAX_LINES} cartas distintas por lado.`);
  return [...byCard].map(([cardId, amount]) => ({ cardId, amount }));
}

// Whether `userId` can give every line right now (spare copies only). Returns the first card
// they can't give, with its name, or null.
async function firstMissing(userId, lines) {
  if (!lines.length) return null;
  const [collection, inDecks] = await Promise.all([UserCollection.findOne({ userId }).lean(), copiesInDecks(userId)]);
  const owned = new Map(((collection && collection.cards) || []).map((c) => [String(c.cardId), c.amount]));
  for (const line of lines) {
    const keep = Math.max(1, inDecks[String(line.cardId)] || 0);
    if ((owned.get(String(line.cardId)) || 0) - keep < line.amount) {
      const card = await Card.findById(line.cardId).select('name').lean();
      return card ? card.name : 'una carta';
    }
  }
  return null;
}

// The cards a player could trade right now: [{ card, owned, inDecks, sellable }]. A player can
// look at their own, or at a friend's (to choose what to ask for).
async function tradeableCards(viewerId, ownerId) {
  if (!isId(ownerId)) throw new TradeError(404, 'Usuario no encontrado.');
  if (!sameId(viewerId, ownerId) && !(await areFriends(viewerId, ownerId))) {
    throw new TradeError(403, 'Solo puedes ver las cartas de tus amigos.');
  }
  return sellableCards(ownerId);
}

async function proposeTrade(proposerId, { friendId, offer, request }) {
  if (!isId(friendId)) throw new TradeError(404, 'Usuario no encontrado.');
  if (sameId(friendId, proposerId)) throw new TradeError(400, 'No puedes intercambiar contigo mismo.');
  if (!(await areFriends(proposerId, friendId))) throw new TradeError(403, 'Solo puedes intercambiar con tus amigos.');

  const offerLines = cleanLines(offer, 'ofreces');
  const requestLines = cleanLines(request, 'pides');
  if (!offerLines.length && !requestLines.length) throw new TradeError(400, 'Elige al menos una carta.');

  const cardIds = [...offerLines, ...requestLines].map((l) => l.cardId);
  const found = await Card.countDocuments({ _id: { $in: [...new Set(cardIds)] } });
  if (found !== new Set(cardIds).size) throw new TradeError(404, 'Alguna de esas cartas no existe.');

  const mine = await firstMissing(proposerId, offerLines);
  if (mine) throw new TradeError(400, `No tienes copias repetidas suficientes de ${mine}.`);
  const theirs = await firstMissing(friendId, requestLines);
  if (theirs) throw new TradeError(400, `Tu amigo no tiene copias repetidas suficientes de ${theirs}.`);

  return Trade.create({ proposer: proposerId, receiver: friendId, offer: offerLines, request: requestLines });
}

// Takes `lines` from `userId`'s spare copies, one atomic update per card. Returns the lines taken
// so far and, if one couldn't be taken, its cardId.
async function takeCards(userId, lines) {
  const taken = [];
  const inDecks = await copiesInDecks(userId);
  for (const line of lines) {
    const keep = Math.max(1, inDecks[String(line.cardId)] || 0);
    const res = await UserCollection.updateOne(
      { userId, cards: { $elemMatch: { cardId: line.cardId, amount: { $gte: line.amount + keep } } } },
      { $inc: { 'cards.$.amount': -line.amount } },
    );
    if (res.modifiedCount !== 1) return { taken, failed: line.cardId };
    taken.push(line);
  }
  return { taken, failed: null };
}

const giveCards = (userId, lines) => (lines.length ? addCardsToCollection(userId, lines.flatMap((l) => Array(l.amount).fill({ cardId: l.cardId }))) : null);

async function acceptTrade(userId, tradeId) {
  if (!isId(tradeId)) throw new TradeError(404, 'Ese intercambio no existe.');
  // Claimed in one step, so it can't be accepted twice at the same time.
  const trade = await Trade.findOneAndUpdate({ _id: tradeId, receiver: userId, status: 'PENDING' }, { status: 'ACCEPTED' }, { new: true });
  if (!trade) throw new TradeError(404, 'Ese intercambio ya no está pendiente.');

  const reopen = () => Trade.updateOne({ _id: trade._id }, { status: 'PENDING' });
  const fail = async (who, cardId) => {
    const card = await Card.findById(cardId).select('name').lean();
    return new TradeError(409, `${who} ya no tiene copias repetidas suficientes de ${card ? card.name : 'una carta'}.`);
  };

  const fromProposer = await takeCards(trade.proposer, trade.offer);
  if (fromProposer.failed) {
    await giveCards(trade.proposer, fromProposer.taken);
    await reopen();
    throw await fail('Tu amigo', fromProposer.failed);
  }
  const fromReceiver = await takeCards(userId, trade.request);
  if (fromReceiver.failed) {
    await giveCards(userId, fromReceiver.taken);
    await giveCards(trade.proposer, fromProposer.taken);
    await reopen();
    throw await fail('Tú', fromReceiver.failed);
  }

  await giveCards(userId, trade.offer);
  await giveCards(trade.proposer, trade.request);
  return trade;
}

async function closeTrade(userId, tradeId, as) {
  if (!isId(tradeId)) throw new TradeError(404, 'Ese intercambio no existe.');
  const filter = as === 'receiver' ? { receiver: userId } : { proposer: userId };
  const trade = await Trade.findOneAndUpdate(
    { _id: tradeId, status: 'PENDING', ...filter },
    { status: as === 'receiver' ? 'REJECTED' : 'CANCELLED' },
    { new: true },
  );
  if (!trade) throw new TradeError(404, 'Ese intercambio ya no está pendiente.');
  return trade;
}

const rejectTrade = (userId, tradeId) => closeTrade(userId, tradeId, 'receiver');
const cancelTrade = (userId, tradeId) => closeTrade(userId, tradeId, 'proposer');

// Pending trades between two players are cancelled when they stop being friends.
const cancelTradesBetween = (idA, idB) =>
  Trade.updateMany(
    { status: 'PENDING', $or: [{ proposer: idA, receiver: idB }, { proposer: idB, receiver: idA }] },
    { status: 'CANCELLED' },
  );

const USER_FIELDS = '_id userName profilePicture';
const CARD_FIELDS = 'name image rarity category expansion attribute atk def level effect family type invocationText';

// The player's pending trades (both directions) and the last ones that closed.
async function myTrades(userId) {
  const populate = (q) => q.populate('proposer receiver', USER_FIELDS).populate('offer.cardId request.cardId', CARD_FIELDS).lean();
  const [incoming, outgoing, history] = await Promise.all([
    populate(Trade.find({ receiver: userId, status: 'PENDING' }).sort({ createdAt: -1 })),
    populate(Trade.find({ proposer: userId, status: 'PENDING' }).sort({ createdAt: -1 })),
    populate(Trade.find({ $or: [{ receiver: userId }, { proposer: userId }], status: { $ne: 'PENDING' } }).sort({ updatedAt: -1 }).limit(10)),
  ]);
  return { incoming, outgoing, history };
}

module.exports = {
  TradeError,
  tradeableCards,
  proposeTrade,
  acceptTrade,
  rejectTrade,
  cancelTrade,
  cancelTradesBetween,
  myTrades,
  MAX_LINES,
};
