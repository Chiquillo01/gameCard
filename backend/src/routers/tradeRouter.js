const { Router } = require('express');
const { getTrades, getTradeableCards, proposeTrade, acceptTrade, rejectTrade, cancelTrade } = require('../controllers/tradeController');

// Card swaps between friends. Mounted behind jwtMiddleware (routers/index.js).
const tradeRouter = Router();

tradeRouter.get('/', getTrades);
tradeRouter.get('/cards/:userId', getTradeableCards);
tradeRouter.post('/', proposeTrade);
tradeRouter.post('/:id/accept', acceptTrade);
tradeRouter.post('/:id/reject', rejectTrade);
tradeRouter.delete('/:id', cancelTrade);

module.exports = { tradeRouter };
