const market = require('../services/market');

// Runs a market operation and answers with its result, or with the MarketError's status and
// message (anything else is a 500).
const handle = (fn, okStatus = 200) => async (req, res) => {
  try {
    res.status(okStatus).json(await fn(req));
  } catch (e) {
    if (e instanceof market.MarketError) return res.status(e.status).json({ error: e.message });
    res.status(500).json({ error: 'Error en el mercado' });
  }
};

const userIdOf = (req) => req.jwtPayload.id;

module.exports = {
  // Cards on sale, one row per card (copies and cheapest price).
  getSummary: handle(() => market.marketSummary()),
  // Active listings, optionally of one card (?cardId=...).
  getListings: handle((req) => market.activeListings(req.query.cardId)),
  // The player's own listings, active and past.
  getMyListings: handle((req) => market.myListings(userIdOf(req))),
  // The player's spare copies they could put up for sale.
  getSellable: handle((req) => market.sellableCards(userIdOf(req))),
  createListing: handle((req) => market.createListing(userIdOf(req), req.body), 201),
  withdrawListing: handle((req) => market.withdrawListing(userIdOf(req), req.params.id)),
  buyListing: handle((req) => market.buyListing(userIdOf(req), req.params.id, req.body.amount ?? 1)),
};
