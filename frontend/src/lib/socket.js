// One real-time connection per tab, shared by every page (friends, duel invitations, the duel
// board). It talks to the same server as the API: VITE_SOCKET_URL if set, otherwise the origin of
// VITE_BACKEND_API_URL. After each (re)connection it authenticates with the session token, so
// the server puts it in this player's own room and sends it only this player's events.
import io from 'socket.io-client';
import { getUserToken } from './utils/localStorage.utils';

const socketUrl = () => {
  if (import.meta.env.VITE_SOCKET_URL) return import.meta.env.VITE_SOCKET_URL;
  try {
    return new URL(import.meta.env.VITE_BACKEND_API_URL).origin;
  } catch (e) {
    return 'http://localhost:3001';
  }
};

let socket = null;

const authenticate = () => {
  const token = getUserToken();
  if (token && socket) socket.emit('auth', token);
};

export const getSocket = () => {
  if (!socket) {
    socket = io(socketUrl());
    socket.on('connect', authenticate);
  }
  return socket;
};

// Closes the connection (on logout), so the next player in this tab gets a fresh one.
export const closeSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};
