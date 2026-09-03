import { getStorageObject, setStorageObject, deleteStorageObject } from './localStorage.utils';

export const getUserSession = () => {
  const session = getStorageObject('user-session');
  if (session) {
    return session.user;
  }
  return null;
};

export const setUserSession = (sessionData) => {
  setStorageObject('user-session', sessionData);
};

export const removeSession = () => {
  deleteStorageObject('user-session');
};
