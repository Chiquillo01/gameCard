import styles from './authtitle.module.css';

const AuthTitle = () => {
  return (
    <header className={styles.header}>
      <div className={styles.bg - 6}>
        <div className={styles.glitch} data-text='PixelQuest'>
          PixelQuest
        </div>
      </div>
      <h3>El juego de cartas coleccionable que estabas esperando</h3>
    </header>
  );
};

export default AuthTitle;
