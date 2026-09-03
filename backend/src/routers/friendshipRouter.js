require('dotenv').config();
const { Router } = require('express');
const { getFriends, sendInvitation } = require('../controllers/friendshipController.js');
const friendshipRouter = Router();

friendshipRouter.get('/', getFriends);
friendshipRouter.post('/invitation', sendInvitation);

module.exports = { friendshipRouter };
