require('dotenv').config();
const { Router } = require('express');
const { getUserCollection, cardForUserDeleteById } = require('../controllers/userCollectionController');
const { jwtMiddleware } = require('../security/jwt.js');
const userCollectionRouter = Router();

userCollectionRouter.get('/', jwtMiddleware, getUserCollection);
userCollectionRouter.delete('/:cardId', jwtMiddleware, cardForUserDeleteById);

module.exports = { userCollectionRouter };
