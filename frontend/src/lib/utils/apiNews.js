import axios from 'axios';
import { getUserToken } from './localStorage.utils';

const API = axios.create({
  baseURL: import.meta.env.VITE_BACKEND_API_URL + '/news',
});

const authHeaders = () => ({ headers: { Authorization: `Bearer ${getUserToken()}` } });

export const newsError = (error, fallback = 'Error en las noticias') => error?.response?.data?.error || fallback;

// What each kind of notice is called on screen.
export const NEWS_KINDS = [
  { id: 'news', label: 'Noticia' },
  { id: 'balance', label: 'Cambio de balance' },
  { id: 'event', label: 'Evento' },
  { id: 'maintenance', label: 'Mantenimiento' },
];

// { news: [{ _id, title, body, kind, createdAt, editedAt, author, unread }], unread }
// Fired on window when the news page marks everything read, so the bell clears at once.
export const NEWS_SEEN_EVENT = 'pixelquest:news-seen';

export const fetchNews = async () => (await API.get('/', authHeaders())).data;

export const fetchUnreadNews = async () => (await API.get('/unread', authHeaders())).data.unread;

export const markNewsSeen = async () => (await API.post('/seen', {}, authHeaders())).data;

export const publishNews = async (news) => (await API.post('/', news, authHeaders())).data;

// Admins: changes the title, text and kind of a published notice (its date stays).
export const updateNews = async (id, news) => (await API.put(`/${id}`, news, authHeaders())).data;

export const deleteNews = async (id) => (await API.delete(`/${id}`, authHeaders())).data;
