const { Router } = require('express');
const { unreadNotices, markRead } = require('../services/notices');

// The player's personal notices (mounted behind jwtMiddleware in routers/index.js).
const noticeRouter = Router();

// GET /notices — unread notices, oldest first.
noticeRouter.get('/', async (req, res) => {
  try {
    res.status(200).json(await unreadNotices(req.jwtPayload.id));
  } catch (e) {
    res.status(500).json({ error: 'Error al cargar los avisos' });
  }
});

// POST /notices/read { ids? } — marks those notices (or all) as read.
noticeRouter.post('/read', async (req, res) => {
  try {
    res.status(200).json(await markRead(req.jwtPayload.id, req.body && req.body.ids));
  } catch (e) {
    res.status(500).json({ error: 'Error al marcar los avisos' });
  }
});

module.exports = { noticeRouter };
