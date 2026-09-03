import styles from './userIcon.module.css';
import { IoNotifications } from 'react-icons/io5';
import { useUser } from '../../../../../context/userContext';
import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQueryClient } from 'react-query';
import { removeSession } from '../../../../../lib/utils/userSession';

const UserIcon = () => {
  const { data, updateUser } = useUser();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    if (!data) {
      updateUser();
    }
  }, [data]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!event.target.closest(`.${styles.modal}`) && !event.target.closest(`.${styles.userIconImage}`)) {
        setIsModalOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    setIsModalOpen(false);
  }, [location]);

  const toggleModal = () => {
    setIsModalOpen((prevState) => !prevState);
  };

  const handleLogout = () => {
    removeSession();
    updateUser(null);
    queryClient.clear();
    navigate('/auth');
  };

  return (
    <div className={styles.userContainer}>
      {/* <div className={styles.notification}>
        <IoNotifications />
      </div> */}

      <div className={styles.userIcon}>
        <div className={styles.userIconImage} onClick={toggleModal}>
          {data?.profilePicture ? (
            <img src={data.profilePicture} alt='Foto de perfil' />
          ) : (
            <img src='/assets/default-icon.png' alt='Icono predeterminado' />
          )}
        </div>

        {isModalOpen && (
          <div className={styles.modal}>
            <button onClick={() => navigate('/profile')}>Perfil de usuario</button>
            <button onClick={() => navigate('/purchase-history')}>Historial de Compras</button>
            <button onClick={() => navigate('/friends')}>Amigos</button>
            <button onClick={handleLogout}>Cerrar Sesión</button>{' '}
          </div>
        )}
      </div>
    </div>
  );
};

export default UserIcon;
