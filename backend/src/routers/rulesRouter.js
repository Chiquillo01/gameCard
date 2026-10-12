const { Router } = require('express');
const { loadRules, publicRules } = require('../game/rules');

// The game's numbers (deck sizes, starting VP, pixels...) for the client, straight from the
// database — the deck builder and the board use them instead of their own copies.
const rulesRouter = Router();

rulesRouter.get('/', async (req, res) => {
  try {
    await loadRules();
    res.json(publicRules());
  } catch (error) {
    res.status(500).json({ error: 'No se pudieron cargar las reglas' });
  }
});

module.exports = { rulesRouter };
