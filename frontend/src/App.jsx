import AuthPage from './components/AuthPage';
import NotFound from './components/AppUser/Layout/NotFound';
import CommingSoon from './components/AppUser/Layout/CommingSoon';
import Layout from './components/AppUser/Layout';
import ProfileEditForm from './components/AppUser/Body/Profile';
import PurchaseHistory from './components/AppUser/Body/PurchaseHistory';
import UserFriendsManagement from './components/AppUser/Body/UserFriendsManagement';
import HomePage from './components/AppUser/Body/HomePage';
import Deck from './components/AppUser/Body/DeckPage';
import User from './components/AppUser/Body/UserPage';
import UserCollection from './components/AppUser/Body/UserCollectionPage';
import CreateNewDeck from './components/AppUser/Body/CreateNewDeck';
import Store from './components/AppUser/Body/Store';
import CardDetailPage from './components/AppUser/Body/Market/CardDetailPage';
import DuelPage from './components/AppUser/Body/Duel';
import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { getUserToken } from './lib/utils/localStorage.utils';
import { UserContextProvider } from './context/userContext';

const ProtectedRoute = ({ children }) => {
  const navigate = useNavigate();

  useEffect(() => {
    const checkToken = () => {
      const currentToken = getUserToken();
      if (currentToken === null) {
        navigate('/auth');
      }
    };
    checkToken();

    window.addEventListener('storage', checkToken);

    return () => {
      window.removeEventListener('storage', checkToken);
    };
  }, [navigate]);
  return children;
};

const App = () => {
  return (
    <BrowserRouter>
      <UserContextProvider>
        <Routes>
          <Route path='auth' element={<AuthPage />} />
          <Route path='commingSoon' element={<CommingSoon />} />
          <Route path='*' element={<NotFound />} />
          <Route
            path='/'
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<HomePage />} />
            <Route path='deck' element={<Deck />} />
            <Route path='controldeck' element={<CreateNewDeck />} />
            <Route path='/deck/:deckId' element={<CreateNewDeck />} />
            <Route path='card-detail/:id' element={<CardDetailPage />} />
            <Route path='collection' element={<UserCollection />} />
            <Route path='store' element={<Store />} />
            <Route path='market' element={<CommingSoon />} />
            <Route path='user' element={<User />} />
            <Route path='profile' element={<ProfileEditForm />} />
            <Route path='purchase-history' element={<PurchaseHistory />} />
            <Route path='friends' element={<UserFriendsManagement />} />
            <Route path='duel' element={<DuelPage />} />
            <Route path='duel/:matchId' element={<DuelPage />} />
          </Route>
        </Routes>
      </UserContextProvider>
    </BrowserRouter>
  );
};

export default App;
