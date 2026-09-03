import { createContext, useContext } from 'react';
import { useQuery, useQueryClient } from 'react-query';
import { fetchCurrentUser } from '../lib/utils/apiUser';
import { getUserToken } from '../lib/utils/localStorage.utils';

const UserContext = createContext();

export const useUser = () => useContext(UserContext);

export const UserContextProvider = ({ children }) => {
  const queryClient = useQueryClient();
  const storedToken = getUserToken();

  const { data } = useQuery('user', () => fetchCurrentUser(storedToken), {
    enabled: !!storedToken,
  });

  const updateUser = (userData = null) => {
    queryClient.setQueryData('user', userData);
    queryClient.invalidateQueries('user');
  };

  return <UserContext.Provider value={{ data, updateUser }}>{children}</UserContext.Provider>;
};
