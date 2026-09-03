const { Router } = require('express');
const { getMarketProducts, createProduct, deleteProduct } = require('../controllers/marketController');
const marketRouter = Router();

marketRouter.get('/:id', getMarketProducts);
marketRouter.post('/create', createProduct);
marketRouter.delete('/delete/:productId', deleteProduct);

module.exports = { marketRouter };
