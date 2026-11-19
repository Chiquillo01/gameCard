const { Router } = require('express');
const {
  getFriends,
  sendInvitation,
  acceptInvitation,
  rejectInvitation,
  cancelInvitation,
  removeFriend,
} = require('../controllers/friendshipController.js');

// Mounted behind jwtMiddleware (routers/index.js).
const friendshipRouter = Router();

friendshipRouter.get('/', getFriends);
friendshipRouter.post('/invitation', sendInvitation);
friendshipRouter.post('/invitation/:id/accept', acceptInvitation);
friendshipRouter.post('/invitation/:id/reject', rejectInvitation);
friendshipRouter.delete('/invitation/:id', cancelInvitation);
friendshipRouter.delete('/:friendId', removeFriend);

module.exports = { friendshipRouter };
