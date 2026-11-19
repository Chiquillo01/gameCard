const trades = require('../services/trades');
const { User } = require('../data/Schema/user');
const { emitToUser } = require('../services/notify');

// Runs a trade operation and answers with its result, or with the TradeError's status and message.
const handle = (fn, okStatus = 200) => async (req, res) => {
  try {
    res.status(okStatus).json(await fn(req));
  } catch (e) {
    if (e instanceof trades.TradeError) return res.status(e.status).json({ error: e.message });
    res.status(500).json({ error: 'Error en el intercambio' });
  }
};

const userIdOf = (req) => String(req.jwtPayload.id);
const nameOf = async (id) => ((await User.findById(id).select('userName').lean()) || {}).userName;
// Both players' trade lists change: their friends page reloads.
const changed = (...ids) => ids.forEach((id) => emitToUser(id, 'trades:changed'));

module.exports = {
  // The player's pending trades and recent history.
  getTrades: handle((req) => trades.myTrades(userIdOf(req))),
  // The spare copies a player could trade: 'me', or a friend's id.
  getTradeableCards: handle((req) => trades.tradeableCards(userIdOf(req), req.params.userId === 'me' ? userIdOf(req) : req.params.userId)),
  proposeTrade: handle(async (req) => {
    const trade = await trades.proposeTrade(userIdOf(req), req.body);
    emitToUser(trade.receiver, 'trade:request', { userName: await nameOf(trade.proposer) });
    changed(trade.proposer, trade.receiver);
    return trade;
  }, 201),
  acceptTrade: handle(async (req) => {
    const trade = await trades.acceptTrade(userIdOf(req), req.params.id);
    emitToUser(trade.proposer, 'trade:accepted', { userName: await nameOf(trade.receiver) });
    changed(trade.proposer, trade.receiver);
    return { message: 'Intercambio hecho' };
  }),
  rejectTrade: handle(async (req) => {
    const trade = await trades.rejectTrade(userIdOf(req), req.params.id);
    emitToUser(trade.proposer, 'trade:rejected', { userName: await nameOf(trade.receiver) });
    changed(trade.proposer, trade.receiver);
    return { message: 'Intercambio rechazado' };
  }),
  cancelTrade: handle(async (req) => {
    const trade = await trades.cancelTrade(userIdOf(req), req.params.id);
    changed(trade.proposer, trade.receiver);
    return { message: 'Intercambio cancelado' };
  }),
};
