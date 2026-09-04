import '@fontsource/metamorphous';
import Header from './Header';
import { Outlet, useLocation } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const Layout = () => {
  const location = useLocation();
  const isHomePage = location.pathname === '/';

  return (
    <>
      {!isHomePage && <Header />}
      <main>
        <ToastContainer />
        <Outlet />
      </main>
    </>
  );
};

export default Layout;
