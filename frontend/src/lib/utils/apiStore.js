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

export const buyChest = async (productId) => {
  const token = getUserToken();

  if (!token) {
    return null;
  }

  const response = await API.post(
    `/products/${productId}/buy-chest`,
    { productId },
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  return response.data;
};

export const buyCurrency = async (productId) => {
  const token = getUserToken();
  if (!token) {
    return null;
  }

  const response = await API.post(
    `/products/${productId}/buy-currency`,
    { productId },
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  return response;
};
