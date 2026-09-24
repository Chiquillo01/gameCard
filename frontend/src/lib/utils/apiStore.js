import axios from 'axios';
import { getUserToken } from './localStorage.utils';

const API = axios.create({
  baseURL: import.meta.env.VITE_BACKEND_API_URL + '/store',
});

export const getProducts = async () => {
  try {
    const response = await API.get('/products');
    return response.data;
  } catch (error) {
    return [];
  }
};

export const buyChest = async (productId, paymentMethod, quantity = 1) => {
  const token = getUserToken();

  if (!token) {
    return null;
  }

  const response = await API.post(
    `/products/${productId}/buy-chest`,
    { productId, paymentMethod, quantity },
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  return response.data;
};

export const buyStructureDeck = async (productId, paymentMethod, quantity = 1) => {
  const token = getUserToken();

  if (!token) {
    return null;
  }

  const response = await API.post(
    `/products/${productId}/buy-structure`,
    { productId, paymentMethod, quantity },
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  return response.data;
};

export const buyCurrency = async (productId, paymentMethod, quantity = 1) => {
  const token = getUserToken();
  if (!token) {
    return null;
  }

  const response = await API.post(
    `/products/${productId}/buy-currency`,
    { productId, paymentMethod, quantity },
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  return response.data;
};
