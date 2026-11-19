import '@fontsource/metamorphous';
import { useEffect } from 'react';
import { Outlet, useLocation, useNavigate, Link } from 'react-router-dom';
import { ToastContainer, toast } from 'react-toastify';
import { useQueryClient } from 'react-query';
import { getSocket } from '../../../lib/socket';
import { fetchNotices, markNoticesRead } from '../../../lib/utils/apiNotices';
import NewsBell from './NewsBell';
import 'react-toastify/dist/ReactToastify.css';
import styles from './layout.module.css';

// The deck builder (new deck at /controldeck, editing one at /deck/:id) is reached from the
// deck list, so "back" should return there instead of all the way out to the tavern.
const isDeckBuilderPath = (pathname) => pathname === '/controldeck' || /^\/deck\/[^/]+$/.test(pathname);

// A live duel draws its own back link inside its top bar so it shares a line with the turn info.
const isActiveDuelPath = (pathname) => /^\/duel\/[^/]+$/.test(pathname);

// Friend and duel events reach the player on any page: a toast (clicking it opens the friends
// page, where they're answered) and, once a friend accepts a duel you proposed, the duel itself.
const toastOptions = { autoClose: 6000, theme: 'dark' };
function useSocialEvents(navigate) {
  useEffect(() => {
    const socket = getSocket();
    const toFriends = () => navigate('/friends');
    const handlers = {
      'friend:request': ({ userName }) => toast.info(`${userName} quiere ser tu amigo.`, { ...toastOptions, onClick: toFriends }),
      'friend:accepted': ({ userName }) => toast.success(`${userName} ha aceptado tu solicitud de amistad.`, toastOptions),
      'duel:invitation': ({ fromUserName }) => toast.info(`${fromUserName || 'Un amigo'} te desafía a un duelo. Pulsa para responder.`, { ...toastOptions, onClick: toFriends }),
      'duel:accepted': ({ matchId }) => navigate(`/duel/${matchId}`),
      'duel:declined': ({ byUserName }) => toast.error(`${byUserName || 'Tu amigo'} ha rechazado el duelo.`, toastOptions),
      'trade:request': ({ userName }) => toast.info(`${userName} te propone un intercambio de cartas. Pulsa para verlo.`, { ...toastOptions, onClick: toFriends }),
      'trade:accepted': ({ userName }) => toast.success(`${userName} ha aceptado tu intercambio. Las cartas ya están en tu colección.`, toastOptions),
      'trade:rejected': ({ userName }) => toast.error(`${userName} ha rechazado tu intercambio.`, toastOptions),
      'news:new': ({ title }) => toast.info(`Nueva noticia: ${title}`, { ...toastOptions, onClick: () => navigate('/news') }),
    };
    Object.entries(handlers).forEach(([event, handler]) => socket.on(event, handler));
    return () => Object.entries(handlers).forEach(([event, handler]) => socket.off(event, handler));
  }, [navigate]);
}

// Personal notices (for now, a card of yours sold on the Market): a toast when one arrives live,
// and on opening the game the ones that came while the player was away. Each is marked read once
// shown, so it isn't shown again. A sale also refreshes the balance (the seller just got paid).
function usePersonalNotices(navigate) {
  const queryClient = useQueryClient();
  useEffect(() => {
    const socket = getSocket();
    const show = (notice) => toast.success(notice.message, { ...toastOptions, autoClose: 8000, onClick: () => navigate('/market') });
    const onSold = (notice) => {
      show(notice);
      queryClient.invalidateQueries('user');
      if (notice._id) markNoticesRead([notice._id]).catch(() => {});
    };
    socket.on('market:sold', onSold);

    let cancelled = false;
    fetchNotices()
      .then((notices) => {
        if (cancelled || !notices.length) return;
        notices.forEach(show);
        markNoticesRead(notices.map((n) => n._id)).catch(() => {});
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      socket.off('market:sold', onSold);
    };
  }, [navigate, queryClient]);
}

const Layout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  useSocialEvents(navigate);
  usePersonalNotices(navigate);
  const isHomePage = location.pathname === '/';
  const isDeckBuilder = isDeckBuilderPath(location.pathname);

  return (
    <main>
      {/* Bottom-right, out of the way of the top bars (the duel's phase button lives up there).
          Toasts don't set their own position, so this is the one place it's decided. */}
      <ToastContainer position='bottom-right' theme='dark' />
      {!isHomePage && !isActiveDuelPath(location.pathname) && (
        <Link to={isDeckBuilder ? '/deck' : '/'} className={styles.backToTavern}>
          ← Volver a {isDeckBuilder ? 'los mazos' : 'la taberna'}
        </Link>
      )}
      {/* The home page draws its own bell next to the player icon; a live duel has no room for it. */}
      {!isHomePage && !isActiveDuelPath(location.pathname) && <NewsBell />}
      <Outlet />
    </main>
  );
};

export default Layout;
