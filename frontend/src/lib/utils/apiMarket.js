import axios from 'axios';
import { getUserToken } from './localStorage.utils';

const API = axios.create({
  baseURL: import.meta.env.VITE_BACKEND_API_URL + '/market',
});

export const getMarketProducts = async (cardId) => {
  const token = getUserToken();

  try {
    const response = await API.get(`/${cardId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.data;
  } catch (error) {
    throw error;
  }
};

export const createNewProductMarket = async (newCard) => {
  const token = getUserToken();

  const response = await API.post(
    '/create',
    { newCard },
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );
  return response;
};

export const deleteProductMarket = async (productId) => {
  const token = getUserToken();

  const response = await API.delete(`/delete/${productId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return response.data;
};
