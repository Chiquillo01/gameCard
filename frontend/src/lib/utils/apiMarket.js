import axios from 'axios';
import { getUserToken } from './localStorage.utils';

const API = axios.create({
  baseURL: import.meta.env.VITE_BACKEND_API_URL + '/market',
});

const auth = () => ({ headers: { Authorization: `Bearer ${getUserToken()}` } });

// Cards on sale, one row per card: { card, copies, listings, minPrice }.
export const getMarketSummary = async () => (await API.get('/summary', auth())).data;

// Active listings of one card, cheapest first.
export const getCardListings = async (cardId) => (await API.get('/listings', { ...auth(), params: { cardId } })).data;

// The player's own listings (active and past) and the spare copies they could sell.
export const getMyListings = async () => (await API.get('/mine', auth())).data;
export const getSellableCards = async () => (await API.get('/sellable', auth())).data;

export const createListing = async ({ cardId, amount, price }) => (await API.post('/listings', { cardId, amount, price }, auth())).data;
export const withdrawListing = async (listingId) => (await API.delete(`/listings/${listingId}`, auth())).data;
export const buyListing = async (listingId, amount) => (await API.post(`/listings/${listingId}/buy`, { amount }, auth())).data;

// The server's own explanation of a refused market action, or a generic one.
export const marketError = (error) => error?.response?.data?.error || 'No se ha podido completar la operación.';
