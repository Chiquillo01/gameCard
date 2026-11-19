import axios from 'axios';
import { getUserToken } from './localStorage.utils';

const API = axios.create({
  baseURL: import.meta.env.VITE_BACKEND_API_URL + '/notices',
});

const auth = () => ({ headers: { Authorization: `Bearer ${getUserToken()}` } });

// The player's unread personal notices (e.g. "X te ha comprado Y por Z monedas"), oldest first:
// [{ _id, kind, message, data, createdAt }].
export const fetchNotices = async () => (await API.get('/', auth())).data;

// Marks those notices as read (all of them without ids), so they aren't shown again.
export const markNoticesRead = async (ids) => (await API.post('/read', ids ? { ids } : {}, auth())).data;
