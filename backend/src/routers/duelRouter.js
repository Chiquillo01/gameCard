const { Router } = require('express');
const { startPve, challenge, listChallenges, declineChallenge, acceptChallenge, getState, sendAction } = require('../controllers/duelController');
const { jwtMiddleware } = require('../security/jwt');

const duelRouter = Router();

duelRouter.post('/pve', jwtMiddleware, startPve);
duelRouter.post('/challenge', jwtMiddleware, challenge);
duelRouter.get('/challenges', jwtMiddleware, listChallenges);
duelRouter.post('/:matchId/accept', jwtMiddleware, acceptChallenge);
duelRouter.post('/:matchId/decline', jwtMiddleware, declineChallenge);
duelRouter.get('/:matchId', jwtMiddleware, getState);
duelRouter.post('/:matchId/action', jwtMiddleware, sendAction);

module.exports = { duelRouter };
