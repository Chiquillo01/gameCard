import '@fontsource/metamorphous';
import { Outlet, useLocation, Link } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import styles from './layout.module.css';

// The deck builder (new deck at /controldeck, editing one at /deck/:id) is reached from the
// deck list, so "back" should return there instead of all the way out to the tavern.
const isDeckBuilderPath = (pathname) => pathname === '/controldeck' || /^\/deck\/[^/]+$/.test(pathname);

// A live duel draws its own back link inside its top bar so it shares a line with the turn info.
const isActiveDuelPath = (pathname) => /^\/duel\/[^/]+$/.test(pathname);

const Layout = () => {
  const location = useLocation();
  const isHomePage = location.pathname === '/';
  const isDeckBuilder = isDeckBuilderPath(location.pathname);

  return (
    <main>
      <ToastContainer />
      {!isHomePage && !isActiveDuelPath(location.pathname) && (
        <Link to={isDeckBuilder ? '/deck' : '/'} className={styles.backToTavern}>
          ← Volver a {isDeckBuilder ? 'los mazos' : 'la taberna'}
        </Link>
      )}
      <Outlet />
    </main>
  );
};

export default Layout;
