import '@fontsource/metamorphous';
import { Outlet, useLocation, Link } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import styles from './layout.module.css';

const Layout = () => {
  const location = useLocation();
  const isHomePage = location.pathname === '/';

  return (
    <main>
      <ToastContainer />
      {!isHomePage && (
        <Link to='/' className={styles.backToTavern}>
          ← Volver a la taberna
        </Link>
      )}
      <Outlet />
    </main>
  );
};

export default Layout;
