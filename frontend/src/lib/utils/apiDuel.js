import axios from 'axios';
import { getUserToken } from './localStorage.utils';

const API = axios.create({
  baseURL: import.meta.env.VITE_BACKEND_API_URL + '/duel',
});

const authHeaders = () => ({ headers: { Authorization: `Bearer ${getUserToken()}` } });

export const startPveDuel = async (deckId) => {
  const response = await API.post('/pve', { deckId }, authHeaders());
  return response.data;
};

export const challengeFriend = async (friendUserId, deckId) => {
  const response = await API.post('/challenge', { friendUserId, deckId }, authHeaders());
  return response.data;
};

export const acceptChallenge = async (matchId, deckId) => {
  const response = await API.post(`/${matchId}/accept`, { deckId }, authHeaders());
  return response.data;
};

export const getDuelState = async (matchId) => {
  const response = await API.get(`/${matchId}`, authHeaders());
  return response.data;
};

// The server answers a rule-rejected action with HTTP 400 and { ok: false, reason, state } — a
// normal outcome the UI turns into a specific message, not a failed request — so that body is
// returned instead of thrown. Anything else (auth, network, 5xx) still throws.
export const sendDuelAction = async (matchId, action) => {
  try {
    const response = await API.post(`/${matchId}/action`, { action }, authHeaders());
    return response.data;
  } catch (error) {
    const data = error.response && error.response.data;
    if (data && data.ok === false && data.state) return data;
    throw error;
  }
};
