const { Router } = require('express');
const { jwtMiddleware } = require('../security/jwt.js');
const { authRouter } = require('./auth');
const { cardRouter } = require('./cardRouter.js');
const { userRouter } = require('./userRouter.js');
const { friendshipRouter } = require('./friendshipRouter.js');
const { userCollectionRouter } = require('./userCollectionRouter.js');
const { deckRouter } = require('./deckRouter.js');
const { storeRouter } = require('./storeRouter.js');
const { marketRouter } = require('./marketRouter.js');
const { adminRouter } = require('./adminRouter');
const { duelRouter } = require('./duelRouter');

const router = Router();

router.use('/auth', authRouter);
router.use('/card', cardRouter);
router.use('/user', userRouter);
router.use('/friendship', jwtMiddleware, friendshipRouter);
router.use('/userCollection', userCollectionRouter);
router.use('/deck', deckRouter);
router.use('/store', storeRouter);
router.use('/market', jwtMiddleware, marketRouter);
router.use('/admin', jwtMiddleware, adminRouter);
router.use('/duel', duelRouter);

module.exports = router;
