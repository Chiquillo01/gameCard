// Personal notices: saved for the player (so they see them on their next visit if they were
// offline) and sent live to their open tabs as `<kind>` with the notice in the payload. The client
// shows it and marks it read, so the same notice isn't shown twice. Never throws: a notice that
// can't be saved must not undo what caused it (a sale is already paid when this runs).
const { UserNotice } = require('../data/Schema/userNotice');
const { emitToUser } = require('./notify');

async function notifyUser(userId, kind, message, data = {}) {
  try {
    const notice = await UserNotice.create({ user: userId, kind, message, data });
    emitToUser(userId, kind, { _id: notice._id, kind, message, data, createdAt: notice.createdAt });
    return notice;
  } catch (e) {
    console.error('No se pudo guardar el aviso para el usuario:', e.message);
    return null;
  }
}

const unreadNotices = (userId) => UserNotice.find({ user: userId, read: false }).sort({ createdAt: 1 }).limit(50).lean();

// Marks the given notices read (only the player's own); without ids, all of them.
async function markRead(userId, ids) {
  const query = { user: userId, read: false };
  if (Array.isArray(ids)) query._id = { $in: ids.filter((id) => /^[0-9a-f]{24}$/i.test(String(id))) };
  const result = await UserNotice.updateMany(query, { read: true });
  return { marked: result.modifiedCount };
}

module.exports = { notifyUser, unreadNotices, markRead };
