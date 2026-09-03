require('dotenv').config();
const { Router } = require('express');
const { getCards } = require('../controllers/cardController');
const cardRouter = Router();

cardRouter.get('/', getCards);

module.exports = { cardRouter };
