import styles from './header.module.css';
import HeaderIcon from './HeaderIcon';
import HeaderNav from './HeaderNav';
import UserIcon from './UserIcon';

const Header = () => {
  return (
    <div className={styles.header}>
      <HeaderIcon />
      <HeaderNav />
      <UserIcon />
    </div>
  );
};

export default Header;
