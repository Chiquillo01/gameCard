const { Router } = require('express');
const { startPve, challenge, acceptChallenge, getState, sendAction } = require('../controllers/duelController');
const { jwtMiddleware } = require('../security/jwt');

const duelRouter = Router();

duelRouter.post('/pve', jwtMiddleware, startPve);
duelRouter.post('/challenge', jwtMiddleware, challenge);
duelRouter.post('/:matchId/accept', jwtMiddleware, acceptChallenge);
duelRouter.get('/:matchId', jwtMiddleware, getState);
duelRouter.post('/:matchId/action', jwtMiddleware, sendAction);

module.exports = { duelRouter };
