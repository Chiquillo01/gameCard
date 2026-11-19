import axios from 'axios';
import { getUserToken } from './localStorage.utils';

const API = axios.create({
  baseURL: import.meta.env.VITE_BACKEND_API_URL + '/trade',
});

const authHeaders = () => ({ headers: { Authorization: `Bearer ${getUserToken()}` } });

// The server's reason for refusing, or `fallback`.
export const tradeError = (error, fallback = 'Error en el intercambio') => error?.response?.data?.error || fallback;

// { incoming: [trade], outgoing: [trade], history: [trade] }
export const fetchTrades = async () => (await API.get('/', authHeaders())).data;

// The spare copies someone could trade: 'me' or a friend's id -> [{ card, owned, sellable }].
export const fetchTradeableCards = async (userId) => (await API.get(`/cards/${userId}`, authHeaders())).data;

// offer / request: [{ cardId, amount }]
export const proposeTrade = async (friendId, offer, request) => (await API.post('/', { friendId, offer, request }, authHeaders())).data;

export const acceptTrade = async (tradeId) => (await API.post(`/${tradeId}/accept`, {}, authHeaders())).data;

export const rejectTrade = async (tradeId) => (await API.post(`/${tradeId}/reject`, {}, authHeaders())).data;

export const cancelTrade = async (tradeId) => (await API.delete(`/${tradeId}`, authHeaders())).data;
