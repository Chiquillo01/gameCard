import { Link } from 'react-router-dom';
import styles from './homePage.module.css';

const HomePage = () => {
  return (
    <div className={styles.homePagecontainer}>
      <h1 className={styles.homePageTitle}>Te damos la bienvenida a PixelQuest TCG</h1>

      <p className={styles.homePageDescription}>
        PixelQuest TCG es un emocionante juego de cartas de estilo medieval fantástico, donde podrás hacer amistades,
        enfrentarte en batallas épicas y coleccionar poderosas cartas. ¿Todo a punto para la aventura?
      </p>

      <div className={styles.homePageSections}>
        <div className={styles.homePageSection}>
          <h2 className={styles.homePageSectionTitle}>El Códex de PixelQuest</h2>
          <p>
            Conoce las reglas de combate de PixelQuest. Domina el campo de batalla y consigue la Maestría Pixel.
          </p>
          <a
            href="/assets/Codex/PixelQuest_TCG_Codex.pdf"
            target="_blank"
            rel="noopener noreferrer"
            className={`${styles.homePageButton} ${styles.battleButton}`}
          >
            Leer el Códex
          </a>
        </div>

        <div className={styles.homePageSection}>
          <h2 className={styles.homePageSectionTitle}>Conoce al equipo</h2>
          <p>
            Descubre quiénes están detrás de este mundo de fantasía y cómo trabajamos para hacer crecer PixelQuest TCG.
          </p>
          <Link to='/commingSoon' className={`${styles.homePageButton} ${styles.aboutButton}`}>
            Sobre nosotros
          </Link>
        </div>
      </div>
    </div>
  );
};

export default HomePage;
