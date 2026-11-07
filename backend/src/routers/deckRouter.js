const { Router } = require('express');
const { getDecksUser, getDeckById, createDeck, updateDeck, deleteDeck, deleteDecks } = require('../controllers/deckController');
const { jwtMiddleware } = require('../security/jwt');
const deckRouter = Router();

deckRouter.get('/user', jwtMiddleware, getDecksUser);
deckRouter.get('/user/:id', jwtMiddleware, getDeckById);
deckRouter.post('/', jwtMiddleware, createDeck);
deckRouter.put('/update/:id', jwtMiddleware, updateDeck);
deckRouter.delete('/:id', jwtMiddleware, deleteDeck);
// Several at once: { ids: [...] }.
deckRouter.post('/delete-many', jwtMiddleware, deleteDecks);

module.exports = { deckRouter };
