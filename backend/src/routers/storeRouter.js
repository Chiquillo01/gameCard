const { Router } = require('express');
const {
  getProducts,
  getUserOrders,
  createProduct,
  updateProduct,
  buyChest,
  buyStructureDeck,
  buyCurrency,
  deleteProduct,
} = require('../controllers/storeProductController');
const { jwtMiddleware } = require('../security/jwt');
const { adminMiddleware } = require('../middlewares');

const storeRouter = Router();

storeRouter.get('/products', getProducts);
storeRouter.get('/orders', jwtMiddleware, getUserOrders);
storeRouter.post('/products', jwtMiddleware, adminMiddleware, createProduct);
storeRouter.post('/products/:productId/buy-chest', jwtMiddleware, buyChest);
storeRouter.post('/products/:productId/buy-structure', jwtMiddleware, buyStructureDeck);
storeRouter.post('/products/:productId/buy-currency', jwtMiddleware, buyCurrency);
storeRouter.put('/products/:id', jwtMiddleware, adminMiddleware, updateProduct);
storeRouter.delete('/products/:id', jwtMiddleware, adminMiddleware, deleteProduct);

module.exports = { storeRouter };
