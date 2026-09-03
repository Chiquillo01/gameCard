import axios from 'axios';

const API = axios.create({
  baseURL: import.meta.env.VITE_BACKEND_API_URL + '/card',
});

export const fetchCards = async () => {
  const response = await API.get('/');
  return response;
};
