import '@fontsource/metamorphous';
import Header from './Header';
import { Outlet } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const Layout = () => (
  <>
    <Header />
    <main>
      <ToastContainer />
      <Outlet />
    </main>
  </>
);

export default Layout;
