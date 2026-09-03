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

export const sendDuelAction = async (matchId, action) => {
  const response = await API.post(`/${matchId}/action`, { action }, authHeaders());
  return response.data;
};
