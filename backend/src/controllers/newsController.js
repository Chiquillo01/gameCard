const mongoose = require('mongoose');
const { News, NEWS_KINDS } = require('../data/Schema/news');
const { User } = require('../data/Schema/user');
const { getIo } = require('../socket/socketServer');

const PAGE_SIZE = 50;

// News is for everyone: every connected tab hears about a new one (to light up its bell).
const broadcast = (event, payload = {}) => {
  try {
    getIo().emit(event, payload);
  } catch (e) {
    /* socket layer optional */
  }
};

// GET /news — the latest notices, newest first, each marked `unread` if it came out after the
// player last opened the news; plus how many are unread.
const getNews = async (req, res) => {
  try {
    const user = await User.findById(req.jwtPayload.id).select('newsSeenAt').lean();
    const seenAt = user && user.newsSeenAt ? new Date(user.newsSeenAt) : null;
    const news = await News.find().sort({ createdAt: -1 }).limit(PAGE_SIZE).populate('author', 'userName').lean();
    const items = news.map((n) => ({ ...n, unread: !seenAt || new Date(n.createdAt) > seenAt }));
    const unread = await News.countDocuments(seenAt ? { createdAt: { $gt: seenAt } } : {});
    res.status(200).json({ news: items, unread });
  } catch (e) {
    res.status(500).json({ error: 'Error al cargar las noticias' });
  }
};

// GET /news/unread — just the count, for the bell.
const getUnreadCount = async (req, res) => {
  try {
    const user = await User.findById(req.jwtPayload.id).select('newsSeenAt').lean();
    const seenAt = user && user.newsSeenAt;
    res.status(200).json({ unread: await News.countDocuments(seenAt ? { createdAt: { $gt: seenAt } } : {}) });
  } catch (e) {
    res.status(500).json({ error: 'Error al cargar las noticias' });
  }
};

// POST /news/seen — the player has read everything up to now.
const markSeen = async (req, res) => {
  try {
    await User.updateOne({ _id: req.jwtPayload.id }, { newsSeenAt: new Date() });
    res.status(200).json({ unread: 0 });
  } catch (e) {
    res.status(500).json({ error: 'Error al marcar las noticias' });
  }
};

// Reads and checks { title, body, kind } from a request: { fields } or { error }.
const readNewsFields = (reqBody = {}) => {
  const title = String(reqBody.title || '').trim();
  const body = String(reqBody.body || '').trim();
  const kind = reqBody.kind || 'news';
  if (!title || !body) return { error: 'La noticia necesita título y texto' };
  if (title.length > 120) return { error: 'El título es demasiado largo (máx. 120)' };
  if (body.length > 5000) return { error: 'El texto es demasiado largo (máx. 5000)' };
  if (!NEWS_KINDS.includes(kind)) return { error: 'Tipo de noticia no válido' };
  return { fields: { title, body, kind } };
};

// POST /news (admin) { title, body, kind }
const createNews = async (req, res) => {
  try {
    const { fields, error } = readNewsFields(req.body);
    if (error) return res.status(400).json({ error });
    const { title, body, kind } = fields;

    const news = await News.create({ title, body, kind, author: req.jwtPayload.id });
    broadcast('news:new', { _id: news._id, title: news.title, kind: news.kind });
    res.status(201).json(news);
  } catch (e) {
    res.status(500).json({ error: 'Error al publicar la noticia' });
  }
};

// PUT /news/:id (admin) { title, body, kind } — same checks as publishing. Keeps the publish
// date (so it doesn't come back as unread) and records when it was edited.
const updateNews = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(404).json({ error: 'Noticia no encontrada' });
    const { fields, error } = readNewsFields(req.body);
    if (error) return res.status(400).json({ error });
    const news = await News.findByIdAndUpdate(id, { ...fields, editedAt: new Date() }, { new: true, runValidators: true });
    if (!news) return res.status(404).json({ error: 'Noticia no encontrada' });
    broadcast('news:updated', { _id: news._id });
    res.status(200).json(news);
  } catch (e) {
    res.status(500).json({ error: 'Error al editar la noticia' });
  }
};

// DELETE /news/:id (admin)
const deleteNews = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(404).json({ error: 'Noticia no encontrada' });
    const deleted = await News.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ error: 'Noticia no encontrada' });
    broadcast('news:deleted', { _id: id });
    res.status(200).json({ message: 'Noticia eliminada' });
  } catch (e) {
    res.status(500).json({ error: 'Error al eliminar la noticia' });
  }
};

module.exports = { getNews, getUnreadCount, markSeen, createNews, updateNews, deleteNews };
