import axios from 'axios';
import { getUserToken } from './localStorage.utils';

const API = axios.create({
  baseURL: import.meta.env.VITE_BACKEND_API_URL + '/deck',
});

export const getUserDecks = async () => {
  try {
    const token = getUserToken();
    if (!token) return [];

    const response = await API.get('/user', {
      headers: { Authorization: `Bearer ${token}` },
    });

    return response.data;
  } catch (error) {
    return [];
  }
};

export const fetchDeck = async (deckId) => {
  try {
    const token = getUserToken();
    if (!token) return null;

    const response = await API.get(`/user/${deckId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    return response.data;
  } catch (error) {
    return null;
  }
};

export const createDeck = async (deckData, token) => {
  try {
    const token = getUserToken();

    if (!token) {
      return;
    }

    const response = await API.post('/', deckData, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return response.data;
  } catch (error) {
    throw new Error('Error al crear el mazo.');
  }
};

export const updateDeck = async (deckId, deckData, token) => {
  try {
    const token = getUserToken();

    if (!token) {
      return;
    }

    const response = await API.put(`/update/${deckId}`, deckData, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return response.data;
  } catch (error) {
    throw new Error('Error al actualizar el mazo.');
  }
};
