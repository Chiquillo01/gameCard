const { Server } = require('socket.io');
const { verifyToken } = require('../security/jwt');

let io; // scope global

const CreateSocketServer = (server) => {
  io = new Server(server, {
    cors: {
      origin: 'http://localhost:3000',
    },
  });

  io.on('connection', (socket) => {
    console.log(`${socket.id} Connected`);

    // Joins this socket to a per-user room so friend requests, duel invitations and duel state
    // updates reach only that player (services/notify.js), instead of being broadcast to everyone.
    socket.on('auth', (token) => {
      try {
        const payload = verifyToken(token);
        socket.userId = payload.id;
        socket.join(`user:${payload.id}`);
      } catch (e) {
        socket.emit('auth:error', { error: 'Token inválido' });
      }
    });

    socket.on('duel:action', ({ matchId, action }) => {
      if (!socket.userId) return;
      require('../controllers/duelController')._handleSocketAction(socket.userId, matchId, action);
    });

    socket.on('disconnect', () => {
      console.log(`${socket.id} Disconnected`);
    });
  });

  return io;
};

function getIo() {
  if (!io) {
    throw new Error('Socket io no esta disponible');
  }
  return io;
}

module.exports = {
  CreateSocketServer,
  getIo,
};
