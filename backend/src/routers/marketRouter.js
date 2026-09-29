const { Router } = require('express');
const {
  getSummary,
  getListings,
  getMyListings,
  getSellable,
  createListing,
  withdrawListing,
  buyListing,
} = require('../controllers/marketController');

// Mounted behind jwtMiddleware (routers/index.js): every route needs a logged-in player.
const marketRouter = Router();

marketRouter.get('/summary', getSummary);
marketRouter.get('/listings', getListings);
marketRouter.get('/mine', getMyListings);
marketRouter.get('/sellable', getSellable);
marketRouter.post('/listings', createListing);
marketRouter.delete('/listings/:id', withdrawListing);
marketRouter.post('/listings/:id/buy', buyListing);

module.exports = { marketRouter };
