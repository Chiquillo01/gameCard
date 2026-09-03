import styles from './footer.module.css';
import { FaFacebook, FaTwitter, FaInstagram } from 'react-icons/fa';
import { Link } from 'react-router-dom';

const Footer = () => {
  return (
    <div className={styles.footer}>
      <div className={styles.footerSection}>
        <h4>Páginas</h4>
        <Link to='/' className={styles.footerLink}>
          HOME
        </Link>
        <Link to='/deck' className={styles.footerLink}>
          Deck Page
        </Link>
        <Link to='/collection' className={styles.footerLink}>
          Collection
        </Link>
        <Link to='/user' className={styles.footerLink}>
          Usuarios
        </Link>
      </div>

      <div className={styles.footerSection}>
        <Link to='/privacy' className={styles.footerLinkTitle}>
          Políticas de Privacidad
        </Link>
        <Link to='/userTerms' className={styles.footerLinkTitle}>
          Terminos de Uso
        </Link>
        <Link to='/cookies' className={styles.footerLinkTitle}>
          Cookies
        </Link>
      </div>

      <div className={styles.footerSection}>
        <h4>Redes Sociales</h4>
        <a href='https://facebook.com' target='_blank' rel='noopener noreferrer'>
          <FaFacebook className={styles.socialIcon} />
        </a>
        <a href='https://twitter.com' target='_blank' rel='noopener noreferrer'>
          <FaTwitter className={styles.socialIcon} />
        </a>
        <a href='https://instagram.com' target='_blank' rel='noopener noreferrer'>
          <FaInstagram className={styles.socialIcon} />
        </a>
        <a href='https://linkedin.com' target='_blank' rel='noopener noreferrer'>
          <FaInstagram className={styles.socialIcon} />
        </a>
      </div>
    </div>
  );
};

export default Footer;
