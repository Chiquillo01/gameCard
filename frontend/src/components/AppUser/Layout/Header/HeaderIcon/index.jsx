import styles from './headerIcon.module.css';
import { Link } from 'react-router-dom';

const HeaderIcon = () => {
  return (
    <div>
      <Link to='/'>
        <img src='/assets/GameImg/logopixelquest4.png' alt='Logo del juego' className={styles.gameIcon} />
      </Link>
    </div>
  );
};

export default HeaderIcon;
