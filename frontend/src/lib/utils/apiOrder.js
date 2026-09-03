import axios from 'axios';
import { getUserToken } from './localStorage.utils';

const API = axios.create({
  baseURL: import.meta.env.VITE_BACKEND_API_URL + '/store',
});

export const getUserOrders = async () => {
  const token = getUserToken();

  if (!token) {
    return [];
  }

  try {
    const response = await API.get('/orders', {
      headers: { Authorization: `Bearer ${token}` },
    });

    return Array.isArray(response.data) ? response.data : [];
  } catch (error) {
    return [];
  }
};
