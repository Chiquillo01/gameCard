import styles from './sendButton.module.css';

const SendButton = ({ isLoading, text }) => {
  return (
    <button
      className={styles.authButton}
      type='submit'
      disabled={isLoading}
      aria-busy={isLoading}
      aria-label={isLoading ? 'Cargando, por favor espere...' : text}
    >
      {isLoading ? 'Cargando...' : text}
    </button>
  );
};

export default SendButton;
