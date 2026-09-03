import styles from './authFormSelector.module.css';

const AuthFormSelector = ({ showLogin, setShowLogin }) => {
  return (
    <div className={styles.tabs}>
      <button className={`${styles.tab} ${showLogin ? styles.active : ''}`} onClick={() => setShowLogin(true)}>
        Iniciar Sesión
      </button>
      <button className={`${styles.tab} ${!showLogin ? styles.active2 : ''}`} onClick={() => setShowLogin(false)}>
        Registrarse
      </button>
    </div>
  );
};

export default AuthFormSelector;
