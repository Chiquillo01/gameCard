export const getStorageObject = (key) => {
  const item = localStorage.getItem(key);
  if (item !== null) {
    return JSON.parse(item);
  }
  return null;
};

export const setStorageObject = (key, object) => {
  localStorage.setItem(key, JSON.stringify(object));
};

export const deleteStorageObject = (key) => {
  localStorage.removeItem(key);
};

// When the session token (a JWT) expires, in seconds since 1970 — null if it can't be read.
const tokenExpiry = (token) => {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch (e) {
    return null;
  }
};

// The stored token, or null once it has expired (the session is dropped then, so the app sends
// the player back to the login screen instead of failing every request).
export const getUserToken = () => {
  const session = getStorageObject('user-session');
  if (!session || !session.token) return null;
  const exp = tokenExpiry(session.token);
  if (exp !== null && exp * 1000 <= Date.now()) {
    deleteStorageObject('user-session');
    return null;
  }
  return session.token;
};
