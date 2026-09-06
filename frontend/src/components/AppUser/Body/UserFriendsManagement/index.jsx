import styles from './userFriendsManagement.module.css';
import io from 'socket.io-client';
import { useState, useEffect } from 'react';
import { FaCheckCircle, FaTimesCircle } from 'react-icons/fa';
import { BsPlusCircleDotted } from 'react-icons/bs';
import { sendInvitation } from '../../../../lib/utils/apiFrienship';
import { successToast, errorToast } from '../../../../lib/toastify/toast';
import { useUser } from '../../../../context/userContext';

const socket = io('http://localhost:3001');

const UserFriendsManagement = () => {
  const [friends, setFriends] = useState(['Juan Pérez', 'María López', 'Carlos Gómez', 'Ana Rodríguez']);
  const [selectedFriend, setSelectedFriend] = useState(null);

  // Usable
  const { data } = useUser();
  const [friendRequests, setFriendRequests] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [friendName, setFriendName] = useState('');

  useEffect(() => {
    return () => {
      socket.off('msg');
    };
  }, []);

  useEffect(() => {
    const handleInvitation = (invitation) => {

      if (invitation.receiver === data._id) {
        setFriendRequests((prevRequests) => [
          ...prevRequests,
          { message: invitation.message },
        ]);
      }
    };

    socket.on('invitation', handleInvitation);
    return () => {
      socket.off('ping', handleInvitation);
    };
  }, [data?.id]);

  const sendFriendRequest = async () => {
    try {
      await sendInvitation(friendName);

      setFriendName('');
      setIsModalOpen(false);
      successToast('Solicitud enviada con exito!!');
    } catch (e) {
      setFriendName('');
      setIsModalOpen(false);
      if (e.status === 404) {
        errorToast('Usuario no existe');
      } else {
        errorToast('Error interno del servidor');
      }
    }
  };

  const acceptRequest = (sender) => {
    setFriendRequests(friendRequests.filter((req) => req.sender !== sender));
    successToast(`Solicitud de amistad aceptada`);
  };

  const rejectRequest = (sender) => {
    setFriendRequests(friendRequests.filter((req) => req.sender !== sender));
    errorToast(`Solicitud de amistad rechazada`);
  };

  return (
    <div className={styles.friendContainer}>
      <div className={styles.sidebar}>
        <h2 className={styles.friendsTitle}>Amigos</h2>
        <ul className={styles.friendsList}>
          {friends.map((friend, index) => (
            <li
              key={index}
              className={styles.friendItem}
              onClick={() => {
                setSelectedFriend(friend);
              }}
            >
              {friend}
            </li>
          ))}
        </ul>
      </div>

      <div className={styles.friendMainContent}>
        <div>
          <div className={styles.friendSectionTitle}>
            <h3 >Solicitudes de Amistad</h3>
            <BsPlusCircleDotted className={styles.plus} onClick={() => setIsModalOpen(true)} />
          </div>
          {friendRequests.length > 0 ? (
            <ul className={styles.friendRequestList}>
              {friendRequests.map((request, index) => (
                <li key={index} className={styles.friendRequestItem}>
                  <p>{request.message}</p>
                  <div className={styles.actionButtons}>
                    <FaCheckCircle className={styles.acceptIcon} onClick={() => acceptRequest(request.sender)} />
                    <FaTimesCircle className={styles.rejectIcon} onClick={() => rejectRequest(request.sender)} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.friendNoRequests}>No tienes solicitudes de amistad.</p>
          )}

          {isModalOpen && (
            <div className={styles.modalInvitation}>
              <div className={styles.modalInvitationContent}>
                <h3>Enviar solicitud de amistad</h3>
                <input
                  type='text'
                  value={friendName}
                  onChange={(e) => setFriendName(e.target.value)}
                  placeholder='Escribe el nombre del usuario'
                />
                <div className={styles.modalInvitationButtons}>
                  <button className={styles.button} onClick={sendFriendRequest}>
                    Enviar Solicitud
                  </button>
                  <button className={styles.closeButton} onClick={() => setIsModalOpen(false)}>
                    Cerrar
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {selectedFriend && (
          <div className={styles.friendOptions}>
            <div className={styles.optionsHeader}>
              <h3 className={styles.optionsTitle}>Opciones para {selectedFriend}</h3>
              <FaTimesCircle
                className={styles.closeIcon}
                onClick={() => setSelectedFriend(null)}
              />
            </div>
            <div className={styles.optionsButtons}>
              <button className={styles.button}>PixelDuel</button>
              <button className={styles.button}>Intercambiar Cartas</button>
              <button
                className={styles.dangerButton}
                onClick={() => {
                  setFriends(friends.filter((f) => f !== selectedFriend));
                  setSelectedFriend(null);
                }}
              >
                Eliminar de Amigos
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default UserFriendsManagement;
