const { Router } = require('express');
const { getNews, getUnreadCount, markSeen, createNews, updateNews, deleteNews } = require('../controllers/newsController');
const { adminMiddleware } = require('../middlewares');

// Game news and balance changes. Mounted behind jwtMiddleware (routers/index.js); publishing,
// editing and deleting are for admins only.
const newsRouter = Router();

newsRouter.get('/', getNews);
newsRouter.get('/unread', getUnreadCount);
newsRouter.post('/seen', markSeen);
newsRouter.post('/', adminMiddleware, createNews);
newsRouter.put('/:id', adminMiddleware, updateNews);
newsRouter.delete('/:id', adminMiddleware, deleteNews);

module.exports = { newsRouter };
