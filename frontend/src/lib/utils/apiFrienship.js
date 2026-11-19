import axios from 'axios';
import { getUserToken } from './localStorage.utils';

const API = axios.create({
  baseURL: import.meta.env.VITE_BACKEND_API_URL + '/friendship',
});

const authHeaders = () => ({ headers: { Authorization: `Bearer ${getUserToken()}` } });

// The server's reason for refusing ("Ese usuario no existe", "Ya le enviaste una solicitud..."),
// or `fallback`.
export const friendshipError = (error, fallback = 'Error interno del servidor') => error?.response?.data?.error || fallback;

// { friends: [user], incoming: [{ _id, user }], outgoing: [{ _id, user }] }
export const fetchFriends = async () => {
  const response = await API.get('/', authHeaders());
  return response.data;
};

export const sendInvitation = async (friendName) => {
  const response = await API.post('/invitation', { friendName }, authHeaders());
  return response.data;
};

export const acceptInvitation = async (invitationId) => {
  const response = await API.post(`/invitation/${invitationId}/accept`, {}, authHeaders());
  return response.data;
};

export const rejectInvitation = async (invitationId) => {
  const response = await API.post(`/invitation/${invitationId}/reject`, {}, authHeaders());
  return response.data;
};

export const cancelInvitation = async (invitationId) => {
  const response = await API.delete(`/invitation/${invitationId}`, authHeaders());
  return response.data;
};

export const removeFriend = async (friendId) => {
  const response = await API.delete(`/${friendId}`, authHeaders());
  return response.data;
};
