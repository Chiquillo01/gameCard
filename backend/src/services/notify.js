// Sends a real-time event to one user's open tabs (the socket room `user:<id>` each tab joins
// after authenticating). Never throws: without a socket server (tests, a REST-only process) the
// event is simply not sent, and the client still sees the change the next time it loads.
const { getIo } = require('../socket/socketServer');

function emitToUser(userId, event, payload = {}) {
  try {
    getIo().to(`user:${userId}`).emit(event, payload);
  } catch (e) {
    /* socket layer optional */
  }
}

module.exports = { emitToUser };
