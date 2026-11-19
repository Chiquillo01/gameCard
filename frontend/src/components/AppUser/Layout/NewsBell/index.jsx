import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FaBell } from 'react-icons/fa';
import styles from './newsBell.module.css';
import { fetchUnreadNews, NEWS_SEEN_EVENT } from '../../../../lib/utils/apiNews';
import { getSocket } from '../../../../lib/socket';

// The bell in the corner: how many news items came out since the player last read them. A new
// notice lights it up straight away; opening the news page (which marks them read) clears it.
const NewsBell = ({ className = '' }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    const refresh = () => fetchUnreadNews().then(setUnread).catch(() => {});
    refresh();
    const socket = getSocket();
    socket.on('news:new', refresh);
    socket.on('news:deleted', refresh);
    const cleared = () => setUnread(0);
    window.addEventListener(NEWS_SEEN_EVENT, cleared);
    return () => {
      socket.off('news:new', refresh);
      socket.off('news:deleted', refresh);
      window.removeEventListener(NEWS_SEEN_EVENT, cleared);
    };
  }, [location.pathname]);

  return (
    <button
      type='button'
      className={`${styles.bell} ${className}`}
      onClick={() => navigate('/news')}
      title={unread ? `${unread} noticia${unread === 1 ? '' : 's'} sin leer` : 'Noticias'}
      aria-label='Noticias'
    >
      <FaBell />
      {unread > 0 && <span className={styles.badge}>{unread > 9 ? '9+' : unread}</span>}
    </button>
  );
};

export default NewsBell;
